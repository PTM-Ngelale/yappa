import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  advanceRound,
  checkLink,
  fetchTargetWord,
  resolveRoundTimeout,
  setTyping,
  startGame,
  submitGuess,
  submitWord,
  tickTimer,
} from '../../src/supabase/round';
import {
  endGame,
  leaveRoom,
  listenToRoom,
  resetRoomToLobby,
  type RoomData,
} from '../../src/supabase/room';
import { onPresenceChange, stopPresence } from '../../src/supabase/presence';
import { useGameSounds } from '../../src/audio/useGameSounds';
import { DisconnectedOverlay } from '../../src/components/DisconnectedOverlay';
import { ReportSheet } from '../../src/components/ReportSheet';
import { SyncErrorBanner } from '../../src/components/SyncErrorBanner';
import { Screen } from '../../src/components/ui';
import { GameEndScreen } from '../../src/screens/GameEndScreen';
import { GuesserScreen } from '../../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../../src/screens/KnowerWaitingScreen';
import { ROUND_INTRO_MS, RoundIntroScreen } from '../../src/screens/RoundIntroScreen';
import { RoundResolutionScreen } from '../../src/screens/RoundResolutionScreen';
import { useGameStore, type RoomPlayer } from '../../src/store/gameStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { fonts, useStyles, useTheme, type Palette } from '../../src/theme';

/** How long the disconnect overlay waits after losing presence before declaring someone offline. */
const DISCONNECT_GRACE_MS = 3000;
const DISCONNECT_COUNTDOWN_SECONDS = 30;

const ROUND_SECONDS = 30;
/** Max seconds the host holds an expired timer for a pending guess — just above validate-guess's 5s AI timeout. */
const GUESS_HOLD_MAX_TICKS = 8;

export default function RoundScreen() {
  const { roomCode, reset: resetGameStore } = useGameStore();
  const { uid } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  // From the room itself, so a player promoted after the host leaves picks up host duties.
  const isHost = !!roomData && !!uid && roomData.hostUid === uid;
  useGameSounds(roomData, uid);
  const styles = useStyles(makeStyles);
  const p = useTheme();

  // Surfaces a failed realtime write (submit, resolve, advance, ...) instead of leaving the
  // player's screen silently stuck — see the retry-wrapped call sites below. Purely cosmetic
  // writes (typing indicator, per-tick timer sync) and the fail-open AI link check are left
  // as console.error-only on purpose: showing an error for those would be noise with no
  // recovery value.
  const [syncError, setSyncError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const attemptEndGame = () => {
    endGame(roomCode!).catch((e) => {
      console.error(e);
      setSyncError({ message: 'Could not end the game — check your connection.', retry: attemptEndGame });
    });
  };

  // Keep a ref for the timer interval closure — avoids stale secondsRemaining
  const roomDataRef = useRef<RoomData | null>(null);
  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  // Round Intro: every device shows the role reveal for a moment when a round starts. The
  // host holds the turn timer meanwhile, so the first Knower still gets the full 30 seconds.
  const [introRound, setIntroRound] = useState<number | null>(null);
  const introActiveRef = useRef(false);
  const playingRound = roomData?.status === 'playing' ? roomData.round : null;
  useEffect(() => {
    if (playingRound === null) return;
    setIntroRound(playingRound);
    introActiveRef.current = true;
    const timeout = setTimeout(() => {
      introActiveRef.current = false;
      setIntroRound(null);
    }, ROUND_INTRO_MS);
    return () => {
      clearTimeout(timeout);
      introActiveRef.current = false;
    };
  }, [playingRound]);

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
    const attemptStartGame = () => {
      startGame(roomCode!).catch((e) => {
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

  // Public games: report a player from Round Result or Game End.
  const reportSheet =
    roomData?.isPublic && roomCode && uid ? (
      <ReportSheet
        visible={reportOpen}
        roomCode={roomCode}
        players={Object.values(roomData.players).filter((pl) => pl.uid !== uid)}
        onClose={() => setReportOpen(false)}
      />
    ) : null;
  const onReport = reportSheet ? () => setReportOpen(true) : undefined;

  function renderWithDisconnectOverlay(screen: React.ReactNode) {
    return (
      <View style={styles.overlayHost}>
        {screen}
        {syncError && (
          <SyncErrorBanner
            message={syncError.message}
            onRetry={
              syncError.retry
                ? () => {
                    const { retry } = syncError;
                    setSyncError(null);
                    retry?.();
                  }
                : undefined
            }
            onDismiss={() => setSyncError(null)}
          />
        )}
        {reportSheet}
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
    let heldTicks = 0;
    const interval = setInterval(() => {
      const current = roomDataRef.current;
      if (!current || current.status !== 'playing' || introActiveRef.current) return;
      const next = Math.max(0, current.secondsRemaining - 1);
      // A guess locked in before time ran out is still being judged — let it land rather
      // than expiring the round under it. Capped so a stuck flag can't freeze the round.
      if (next === 0 && current.guessPending && heldTicks < GUESS_HOLD_MAX_TICKS) {
        heldTicks += 1;
        return;
      }
      if (next === 0) {
        const attemptResolve = () => {
          resolveRoundTimeout(roomCode!, current.round).catch((e) => {
            console.error(e);
            setSyncError({ message: 'Could not end the round — check your connection.', retry: attemptResolve });
          });
        };
        attemptResolve();
      } else {
        tickTimer(roomCode!, current.round).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isHost, roomData?.status, confirmedDisconnected]);

  // Knowers fetch this round's word from round_secrets. The Guesser never asks — and RLS
  // would return nothing if they did — so the answer never reaches their device.
  const [target, setTarget] = useState<{ round: number; word: string } | null>(null);

  // The word this Knower just sent, shown at once — in the chain, with the turn passed —
  // per the spec's "no visible lag" submit, instead of waiting for the server round-trip.
  // It only counts while the server's chain is still at index (see `pending` below); a
  // rejection clears it.
  const [sentWord, setSentWord] = useState<{ round: number; index: number; word: string } | null>(null);
  const isGuesserThisRound = !!roomData && roomData.guesserUid === uid;
  useEffect(() => {
    if (!roomCode || !uid || roomData?.status !== 'playing' || isGuesserThisRound) return;
    const round = roomData.round;
    if (target?.round === round) return;
    let cancelled = false;
    const attemptFetch = () => {
      fetchTargetWord(roomCode, round)
        .then((word) => {
          if (cancelled) return;
          if (!word) throw new Error(`no target word visible for round ${round}`);
          setTarget({ round, word });
        })
        .catch((e) => {
          if (cancelled) return;
          console.error(e);
          setSyncError({ message: 'Could not load the secret word — check your connection.', retry: attemptFetch });
        });
    };
    attemptFetch();
    return () => { cancelled = true; };
    // Re-runs per round/role; `target` is only read to skip a redundant fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, uid, roomData?.status, roomData?.round, isGuesserThisRound]);

  // Loading — waiting for RTDB snapshot
  if (!roomData || !uid) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={p.ink} size="large" />
          <Text style={styles.statusText}>Connecting…</Text>
        </View>
      </Screen>
    );
  }

  // Initializing — host is setting up round 1
  if (roomData.status === 'lobby') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={p.ink} size="large" />
          <Text style={styles.statusText}>Starting round…</Text>
        </View>
      </Screen>
    );
  }

  const history = Object.values(roomData.history ?? {}).sort((a, b) => a.round - b.round);

  // Round Resolution — reveal + score + advance to next round
  if (roomData.status === 'resolution') {
    const lastEntry = history[history.length - 1];
    if (!lastEntry) {
      return (
        <Screen>
          <View style={styles.center}>
            <ActivityIndicator color={p.ink} size="large" />
            <Text style={styles.statusText}>Tallying the round…</Text>
          </View>
        </Screen>
      );
    }
    return renderWithDisconnectOverlay(
      <RoundResolutionScreen
        round={lastEntry.round}
        maxRounds={roomData.maxRounds}
        outcome={lastEntry.outcome}
        targetWord={lastEntry.targetWord}
        guess={lastEntry.guess ?? null}
        guesserName={roomData.players[lastEntry.guesserUid]?.name ?? 'The Guesser'}
        isMyGuess={lastEntry.guesserUid === uid}
        chain={lastEntry.chain ?? []}
        linkChecks={lastEntry.linkChecks}
        results={history.map((h) => (h.outcome === 'won' ? 'won' : 'lost'))}
        isHost={isHost}
        onReport={onReport}
        onNextRound={() => {
          const attemptAdvance = () => {
            advanceRound(roomCode!, roomData.round).catch((e) => {
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
      <>
        <GameEndScreen
          history={history}
          players={roomData.players}
          maxRounds={roomData.maxRounds}
          onReport={onReport}
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
        {reportSheet}
      </>
    );
  }

  // Waiting for player record to appear (rare race)
  const myPlayer = roomData.players[uid];
  if (!myPlayer) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={p.ink} size="large" />
          <Text style={styles.statusText}>Syncing your seat…</Text>
        </View>
      </Screen>
    );
  }

  // Role reveal at the start of each round (also covers the Knowers' secret-word fetch).
  if (introRound === roomData.round) {
    const isGuesser = roomData.guesserUid === uid;
    const knowers = Object.values(roomData.players).filter((pl) => pl.uid !== roomData.guesserUid);
    return renderWithDisconnectOverlay(
      <RoundIntroScreen
        round={roomData.round}
        isGuesser={isGuesser}
        category={roomData.category}
        knowerNames={(isGuesser ? knowers : knowers.filter((k) => k.uid !== uid)).map((k) => k.name)}
        guesserName={roomData.players[roomData.guesserUid]?.name ?? 'the Guesser'}
      />
    );
  }

  const serverChain: string[] = roomData.chain ?? [];
  const pending =
    sentWord && sentWord.round === roomData.round && serverChain.length === sentWord.index
      ? sentWord
      : null;
  const chain = pending ? [...serverChain, pending.word] : serverChain;
  const typing = roomData.typing ?? {};

  // Knower, word not fetched yet for this round
  if (myPlayer.role === 'knower' && target?.round !== roomData.round) {
    return renderWithDisconnectOverlay(
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={p.ink} size="large" />
          <Text style={styles.statusText}>Getting the secret word…</Text>
        </View>
      </Screen>
    );
  }
  const targetWord = target?.word ?? '';

  // Active Knower — it's my turn to add a word
  if (myPlayer.role === 'knower' && roomData.activeKnowerUid === uid && !pending) {
    return renderWithDisconnectOverlay(
      <KnowerActiveScreen
        round={roomData.round}
        maxRounds={roomData.maxRounds}
        targetWord={targetWord}
        category={roomData.category}
        chain={chain}
        durationSeconds={ROUND_SECONDS}
        secondsRemaining={roomData.secondsRemaining}
        onSubmitWord={(word) => {
          const round = roomData.round;
          const attemptSubmit = () => {
            setSentWord({ round, index: serverChain.length, word });
            submitWord(roomCode!, round, word)
              .then((index) => {
                if (index > 0) checkLink(roomCode!, index).catch(console.error);
              })
              .catch((e) => {
                console.error(e);
                setSentWord(null); // hand the turn back on screen
                if (e instanceof Error && e.message.includes('word not allowed')) {
                  setSyncError({ message: 'That word isn’t allowed — try another one.' });
                  return;
                }
                // Only offer a retry while it's still this player's turn in this round —
                // otherwise the server rejected a stale move and retrying can't help.
                const latest = roomDataRef.current;
                if (latest?.status === 'playing' && latest.round === round && latest.activeKnowerUid === uid) {
                  setSyncError({ message: 'Your word might not have sent — check your connection.', retry: attemptSubmit });
                }
              });
          };
          attemptSubmit();
        }}
        onTypingChange={(isTyping) => {
          setTyping(roomCode!, isTyping).catch(console.error);
        }}
      />
    );
  }

  // Waiting Knower — partner is active (or about to be, while my sent word is in flight)
  if (myPlayer.role === 'knower') {
    const partnerUid = pending
      ? Object.keys(roomData.players).find((u) => u !== uid && u !== roomData.guesserUid) ?? ''
      : roomData.activeKnowerUid;
    const partner = roomData.players[partnerUid];
    return renderWithDisconnectOverlay(
      <KnowerWaitingScreen
        round={roomData.round}
        maxRounds={roomData.maxRounds}
        targetWord={targetWord}
        category={roomData.category}
        chain={chain}
        partnerName={partner?.name ?? 'Partner'}
        partnerColor={partner?.avatarColor}
        partnerIsTyping={!!typing[partnerUid]}
        durationSeconds={ROUND_SECONDS}
        // The partner's turn starts fresh; the server's countdown is still on mine until it lands.
        secondsRemaining={pending ? ROUND_SECONDS : roomData.secondsRemaining}
      />
    );
  }

  // Guesser
  const activeKnower = roomData.players[roomData.activeKnowerUid];
  return renderWithDisconnectOverlay(
    <GuesserScreen
      round={roomData.round}
      maxRounds={roomData.maxRounds}
      category={roomData.category}
      chain={chain}
      activeKnowerName={activeKnower?.name ?? 'Knower'}
      knowerIsTyping={!!typing[roomData.activeKnowerUid]}
      durationSeconds={ROUND_SECONDS}
      secondsRemaining={roomData.secondsRemaining}
      // Throws if the guess couldn't be submitted — GuesserScreen lets them retry.
      onGuess={(guess) => submitGuess(roomCode!, roomData.round, guess)}
    />
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    overlayHost: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 24,
    },
    statusText: { fontFamily: fonts.bold, fontSize: 20, color: p.ink },
  });
