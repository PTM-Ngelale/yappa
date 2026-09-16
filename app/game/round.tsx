import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceRound,
  checkLink,
  resolveRound,
  setTyping,
  startGame,
  submitWord,
  tickTimer,
} from '../../src/supabase/round';
import {
  leaveRoom,
  listenToRoom,
  resetRoomToLobby,
  updateRoomField,
  type RoomData,
} from '../../src/supabase/room';
import { onPresenceChange, stopPresence } from '../../src/supabase/presence';
import { DisconnectedOverlay } from '../../src/components/DisconnectedOverlay';
import { SyncErrorBanner } from '../../src/components/SyncErrorBanner';
import { GameEndScreen } from '../../src/screens/GameEndScreen';
import { GuesserScreen } from '../../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../../src/screens/KnowerWaitingScreen';
import { RoundResolutionScreen } from '../../src/screens/RoundResolutionScreen';
import { useGameStore, type RoomPlayer } from '../../src/store/gameStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { colors, typography } from '../../src/theme';

/** How long the disconnect overlay waits after losing presence before declaring someone offline. */
const DISCONNECT_GRACE_MS = 3000;
const DISCONNECT_COUNTDOWN_SECONDS = 30;

const ROUND_SECONDS = 30;

export default function RoundScreen() {
  const { roomCode, isHost, reset: resetGameStore } = useGameStore();
  const { uid } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);

  // Surfaces a failed realtime write (submit, resolve, advance, ...) instead of leaving the
  // player's screen silently stuck — see the retry-wrapped call sites below. Purely cosmetic
  // writes (typing indicator, per-tick timer sync) and the fail-open AI link check are left
  // as console.error-only on purpose: showing an error for those would be noise with no
  // recovery value.
  const [syncError, setSyncError] = useState<{ message: string; retry: () => void } | null>(null);

  const attemptEndGame = () => {
    updateRoomField(roomCode!, { status: 'gameover' }).catch((e) => {
      console.error(e);
      setSyncError({ message: 'Could not end the game — check your connection.', retry: attemptEndGame });
    });
  };

  // Keep a ref for the timer interval closure — avoids stale secondsRemaining
  const roomDataRef = useRef<RoomData | null>(null);
  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  // Subscribe to room in real time
  useEffect(() => {
    if (!roomCode) return;
    return listenToRoom(roomCode, setRoomData);
  }, [roomCode]);

  // Host: kick off round 1 once (guard against re-fires)
  const roundInitiated = useRef(false);
  useEffect(() => {
    if (!isHost || !roomData || roomData.status !== 'lobby' || roundInitiated.current) return;
    roundInitiated.current = true;
    const players = Object.values(roomData.players);
    const attemptStartGame = () => {
      startGame(roomCode!, players).catch((e) => {
        console.error(e);
        setSyncError({ message: 'Could not start the game — check your connection.', retry: attemptStartGame });
      });
    };
    attemptStartGame();
  }, [isHost, roomData?.status]);

  // Everyone: once a game has been seen in progress, a status flip back to 'lobby'
  // means the host hit "Play Again" — return to the Lobby screen to start over.
  const sawGameplayRef = useRef(false);
  useEffect(() => {
    if (roomData && roomData.status !== 'lobby') sawGameplayRef.current = true;
  }, [roomData?.status]);
  useEffect(() => {
    if (roomData?.status === 'lobby' && sawGameplayRef.current) {
      router.replace('/lobby');
    }
  }, [roomData?.status]);

  // Track which players are currently online in this room via Realtime Presence.
  const [onlineUids, setOnlineUids] = useState<Set<string>>(new Set());
  useEffect(() => onPresenceChange(setOnlineUids), []);

  // A player (other than me) missing from presence during active gameplay —
  // debounced so a brief presence sync lag doesn't flash the overlay for everyone.
  const disconnectedCandidate: RoomPlayer | null =
    roomData && uid && (roomData.status === 'playing' || roomData.status === 'resolution')
      ? Object.values(roomData.players).find(
          (p) => p.uid !== uid && !onlineUids.has(p.uid)
        ) ?? null
      : null;

  const [confirmedDisconnected, setConfirmedDisconnected] = useState<RoomPlayer | null>(null);
  useEffect(() => {
    if (!disconnectedCandidate) {
      setConfirmedDisconnected(null);
      return;
    }
    const timeout = setTimeout(
      () => setConfirmedDisconnected(disconnectedCandidate),
      DISCONNECT_GRACE_MS
    );
    return () => clearTimeout(timeout);
  }, [disconnectedCandidate?.uid]);

  // 30s countdown while someone's disconnected — elapsing ends the game for everyone.
  const [disconnectCountdown, setDisconnectCountdown] = useState(DISCONNECT_COUNTDOWN_SECONDS);
  useEffect(() => {
    if (!confirmedDisconnected) {
      setDisconnectCountdown(DISCONNECT_COUNTDOWN_SECONDS);
      return;
    }
    const interval = setInterval(() => {
      setDisconnectCountdown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          attemptEndGame();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [confirmedDisconnected?.uid]);

  function renderWithDisconnectOverlay(screen: React.ReactNode) {
    return (
      <View style={styles.overlayHost}>
        {screen}
        {syncError && (
          <SyncErrorBanner
            message={syncError.message}
            onRetry={() => {
              const { retry } = syncError;
              setSyncError(null);
              retry();
            }}
            onDismiss={() => setSyncError(null)}
          />
        )}
        {confirmedDisconnected && (
          <DisconnectedOverlay
            playerName={confirmedDisconnected.name}
            secondsLeft={disconnectCountdown}
            onEndGame={attemptEndGame}
          />
        )}
      </View>
    );
  }

  // Host: drive the timer — one interval per playing session
  useEffect(() => {
    if (!isHost || roomData?.status !== 'playing' || confirmedDisconnected) return;
    const interval = setInterval(() => {
      const current = roomDataRef.current;
      if (!current || current.status !== 'playing') return;
      const next = Math.max(0, current.secondsRemaining - 1);
      if (next === 0) {
        const attemptResolve = () => {
          resolveRound(
            roomCode!,
            current.round,
            current.category,
            current.targetWord,
            current.chain ?? [],
            current.guesserUid,
            'lost-timeout',
            current.linkChecks,
          ).catch((e) => {
            console.error(e);
            setSyncError({ message: 'Could not end the round — check your connection.', retry: attemptResolve });
          });
        };
        attemptResolve();
      } else {
        tickTimer(roomCode!, next).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isHost, roomData?.status, confirmedDisconnected]);

  // Loading — waiting for RTDB snapshot
  if (!roomData || !uid) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.statusText}>Connecting…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Initializing — host is setting up round 1
  if (roomData.status === 'lobby') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.statusText}>Starting round…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const history = Object.values(roomData.history ?? {}).sort((a, b) => a.round - b.round);

  // Round Resolution — reveal + score + advance to next round
  if (roomData.status === 'resolution') {
    const lastEntry = history[history.length - 1];
    if (!lastEntry) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.statusText}>Tallying the round…</Text>
          </View>
        </SafeAreaView>
      );
    }
    const scoreSoFar = history.filter((h) => h.outcome === 'won').length;
    return renderWithDisconnectOverlay(
      <RoundResolutionScreen
        round={lastEntry.round}
        maxRounds={roomData.maxRounds}
        outcome={lastEntry.outcome}
        targetWord={lastEntry.targetWord}
        chain={lastEntry.chain}
        linkChecks={lastEntry.linkChecks}
        scoreSoFar={scoreSoFar}
        isHost={isHost}
        onNextRound={() => {
          const attemptAdvance = () => {
            advanceRound(
              roomCode!,
              roomData.round,
              roomData.maxRounds,
              roomData.playerOrder ?? [],
              roomData.players,
              roomData.gameWords ?? [],
            ).catch((e) => {
              console.error(e);
              setSyncError({ message: 'Could not advance to the next round — check your connection.', retry: attemptAdvance });
            });
          };
          attemptAdvance();
        }}
      />
    );
  }

  // Game End — final score + per-round breakdown
  if (roomData.status === 'gameover') {
    return (
      <GameEndScreen
        history={history}
        players={roomData.players}
        maxRounds={roomData.maxRounds}
        onPlayAgain={() => {
          resetRoomToLobby(roomCode!).catch(console.error);
        }}
        onBackToHome={() => {
          if (uid) leaveRoom(roomCode!, uid).catch(console.error);
          stopPresence();
          resetGameStore();
          router.replace('/');
        }}
      />
    );
  }

  // Waiting for player record to appear (rare race)
  const myPlayer = roomData.players[uid];
  if (!myPlayer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.statusText}>Syncing your seat…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const chain: string[] = roomData.chain ?? [];
  const players = Object.values(roomData.players);
  const knowers = players.filter((p) => p.role === 'knower');
  const nextKnowerUid =
    knowers.find((p) => p.uid !== roomData.activeKnowerUid)?.uid ??
    roomData.activeKnowerUid;
  const typing = roomData.typing ?? {};

  // Active Knower — it's my turn to add a word
  if (myPlayer.role === 'knower' && roomData.activeKnowerUid === uid) {
    return renderWithDisconnectOverlay(
      <KnowerActiveScreen
        round={roomData.round}
        targetWord={roomData.targetWord}
        category={roomData.category}
        chain={chain}
        durationSeconds={ROUND_SECONDS}
        secondsRemaining={roomData.secondsRemaining}
        onSubmitWord={(word) => {
          const index = chain.length;
          const attemptSubmit = () => {
            submitWord(roomCode!, chain, word, nextKnowerUid, uid).catch((e) => {
              console.error(e);
              setSyncError({ message: 'Your word might not have sent — check your connection.', retry: attemptSubmit });
            });
          };
          attemptSubmit();
          if (chain.length > 0) {
            checkLink(roomCode!, chain[chain.length - 1], word, index).catch(console.error);
          }
        }}
        onTypingChange={(isTyping) => {
          setTyping(roomCode!, uid, isTyping).catch(console.error);
        }}
      />
    );
  }

  // Waiting Knower — partner is active
  if (myPlayer.role === 'knower') {
    const activeKnower = roomData.players[roomData.activeKnowerUid];
    return renderWithDisconnectOverlay(
      <KnowerWaitingScreen
        round={roomData.round}
        targetWord={roomData.targetWord}
        category={roomData.category}
        chain={chain}
        partnerName={activeKnower?.name ?? 'Partner'}
        partnerIsTyping={!!typing[roomData.activeKnowerUid]}
        durationSeconds={ROUND_SECONDS}
        secondsRemaining={roomData.secondsRemaining}
      />
    );
  }

  // Guesser
  const activeKnower = roomData.players[roomData.activeKnowerUid];
  return renderWithDisconnectOverlay(
    <GuesserScreen
      round={roomData.round}
      category={roomData.category}
      chain={chain}
      activeKnowerName={activeKnower?.name ?? 'Knower'}
      knowerIsTyping={!!typing[roomData.activeKnowerUid]}
      durationSeconds={ROUND_SECONDS}
      secondsRemaining={roomData.secondsRemaining}
      onGuess={(guess) => {
        const correct =
          guess.toLowerCase().trim() === roomData.targetWord.toLowerCase().trim();
        const attemptResolve = () => {
          resolveRound(
            roomCode!,
            roomData.round,
            roomData.category,
            roomData.targetWord,
            chain,
            roomData.guesserUid,
            correct ? 'won' : 'lost-guess',
            roomData.linkChecks,
          ).catch((e) => {
            console.error(e);
            setSyncError({ message: 'Could not submit your guess — check your connection.', retry: attemptResolve });
          });
        };
        attemptResolve();
        return correct;
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlayHost: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 32,
  },
  statusText: { ...typography.bodyLg, color: colors.onSurfaceVariant },
});
