import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import {
  advanceRound,
  expireRound,
  fetchTargetWord,
  setTyping,
  skipTurn,
  startGame,
  submitGuess,
  submitWord,
  wordRejection,
  type SecretWord,
  type WordRejection,
} from '../../src/supabase/round';
import {
  createShareCard,
  endGame,
  leaveRoom,
  listenToRoom,
  resetRoomToLobby,
  type RoomData,
} from '../../src/supabase/room';
import { onPresenceChange, stopPresence } from '../../src/supabase/presence';
import { useGameSounds } from '../../src/audio/useGameSounds';
import { DisconnectedOverlay } from '../../src/components/DisconnectedOverlay';
import { LeaveGameContext, LeaveGameDialog } from '../../src/components/LeaveGame';
import { shareCard } from '../../src/lib/shareCard';
import { useLeaveWarning } from '../../src/hooks/useLeaveWarning';
import { DUO_CLUES, roomClocks } from '../../src/game/config';
import { knowerOrder, nextKnower } from '../../src/game/players';
import { useRoundClocks } from '../../src/hooks/useRoundClocks';
import { errorText } from '../../src/lib/errorText';
import { ReportSheet } from '../../src/components/ReportSheet';
import { SyncErrorBanner } from '../../src/components/SyncErrorBanner';
import { Screen } from '../../src/components/ui';
import { GameEndScreen } from '../../src/screens/GameEndScreen';
import { GuesserScreen } from '../../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../../src/screens/KnowerWaitingScreen';
import { ROUND_INTRO_MS, RoundIntroScreen } from '../../src/screens/RoundIntroScreen';
import { RoundResolutionScreen } from '../../src/screens/RoundResolutionScreen';
import type { FeedEntry } from '../../src/supabase/room';
import { useGameStore, type RoomPlayer } from '../../src/store/gameStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { pickTip, TIPS, type TipId } from '../../src/game/tips';
import { fonts, useStyles, useTheme, type Palette } from '../../src/theme';

/** How long the disconnect overlay waits after losing presence before declaring someone offline. */
const DISCONNECT_GRACE_MS = 3000;
const DISCONNECT_COUNTDOWN_SECONDS = 30;

/** What to tell a Knower whose word the server refused. */
const WORD_REJECTED: Record<WordRejection, string> = {
  'not-your-turn': 'Too slow! The turn passed.',
  'turn-over': 'Too slow! The turn passed.',
  paused: 'The game is paused. Hang on.',
  target: 'Too close to the secret word. Try another one.',
  'off-limits': 'That one’s off-limits. Try another word.',
  repeat: 'That was the last word. Try another one.',
  shape: 'One word only, please. Try another.',
  blocked: 'That word isn’t allowed. Try another one.',
  'out-of-clues': 'That’s all your clues for this round.',
};

export default function RoundScreen() {
  const { roomCode, reset: resetGameStore } = useGameStore();
  const { uid } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  // From the room itself, so a player promoted after the host leaves picks up host duties.
  const isHost = !!roomData && !!uid && roomData.hostUid === uid;
  useLeaveWarning(roomData?.status === 'playing' || roomData?.status === 'resolution');
  const styles = useStyles(makeStyles);
  const p = useTheme();

  // Surfaces a failed realtime write (submit, advance, ...) instead of leaving the player's
  // screen silently stuck: see the retry-wrapped call sites below. Purely cosmetic writes
  // (typing indicator) are left console.error-only on purpose: showing an error for those
  // would be noise with no recovery value.
  const [syncError, setSyncError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const attemptEndGame = () => {
    endGame(roomCode!).catch((e) => {
      console.error(e);
      setSyncError({ message: 'Could not end the game — check your connection.', retry: attemptEndGame });
    });
  };

  // Leaving mid-game ends it for everyone (it needs everyone who started), then takes this player Home
  // straight away; the server calls finish in the background.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const inGame = roomData?.status === 'playing' || roomData?.status === 'resolution';
  const leaveGame = () => {
    setLeaveOpen(false);
    const code = roomCode;
    if (code && uid) {
      endGame(code)
        .catch(console.error)
        .then(() => leaveRoom(code, uid))
        .catch(console.error);
    }
    stopPresence();
    resetGameStore();
    router.replace('/');
  };
  // Android back asks first instead of dropping out of the game.
  useEffect(() => {
    if (!inGame || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setLeaveOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [inGame]);

  // Latest room for timer and async closures (skips, expiry, a rejected word's retry)
  const roomDataRef = useRef<RoomData | null>(null);
  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  // Round Intro: every device shows the role reveal for a moment when a round starts. The
  // first turn and the round get that time on top, so play itself gets the full clocks.
  const [introRound, setIntroRound] = useState<number | null>(null);
  const playingRound = roomData?.status === 'playing' ? roomData.round : null;
  useEffect(() => {
    if (playingRound === null) return;
    // Every new round the role card comes up; tapping it puts it away early.
    setIntroRound(playingRound);
    const timeout = setTimeout(() => setIntroRound(null), ROUND_INTRO_MS);
    return () => clearTimeout(timeout);
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

  // Everyone: once the game has ended, a status flip back to 'lobby' means the host hit
  // "Play Again" — return to the Lobby screen to start over. Only after 'gameover': starting
  // a game also emits a 'lobby' update (start_game writes the room twice), and if that one
  // arrives after 'playing' it must not be mistaken for Play Again.
  const sawGameOverRef = useRef(false);
  useEffect(() => {
    if (roomData?.status === 'gameover') sawGameOverRef.current = true;
  }, [roomData?.status]);
  useEffect(() => {
    if (roomData?.status === 'lobby' && sawGameOverRef.current) {
      router.replace('/lobby');
    }
  }, [roomData?.status]);

  // Track which players are currently online in this room via Realtime Presence.
  const [onlineUids, setOnlineUids] = useState<Set<string>>(new Set());
  useEffect(() => onPresenceChange(setOnlineUids), []);

  // A player (other than me) missing from presence during active gameplay —
  // debounced so a brief presence sync lag doesn't flash the overlay for everyone. Only
  // when this device can see itself online: if it can't, it's this device's connection
  // that's broken (it reconnects on its own), not the others'.
  const disconnectedCandidate: RoomPlayer | null =
    roomData && uid && onlineUids.has(uid) && (roomData.status === 'playing' || roomData.status === 'resolution')
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

  // This device's turn and round clocks; both stand still while someone's dropped.
  const { turnSeconds, roundSeconds } = useRoundClocks(roomCode, roomData, !!confirmedDisconnected);
  const clocks = roomClocks(roomData);
  useGameSounds(roomData, uid, roundSeconds);

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
        <LeaveGameContext.Provider value={inGame ? () => setLeaveOpen(true) : null}>{screen}</LeaveGameContext.Provider>
        <LeaveGameDialog visible={leaveOpen && inGame} onLeave={leaveGame} onStay={() => setLeaveOpen(false)} />
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

  // When the turn clock runs out, pass the turn on; when the round clock runs out, end the
  // round. Every device asks: the server acts once, and only when its own clock agrees, so a
  // device that asks a moment early (or while a guess is still being judged) asks again.
  // Duo has no turn clock: its one Knower keeps the turn all round.
  const playing = roomData?.status === 'playing' && !confirmedDisconnected;
  const turnOver =
    playing && roomData!.mode !== 'duo' && turnSeconds === 0 ? `${roomData!.round}:${roomData!.turnIndex ?? 0}` : null;
  useEffect(() => {
    if (!turnOver || !roomCode) return;
    const [round, turn] = turnOver.split(':').map(Number);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      skipTurn(roomCode, round, turn)
        .then((done) => {
          const latest = roomDataRef.current;
          const stillThisTurn = latest?.status === 'playing' && latest.round === round && (latest.turnIndex ?? 0) === turn;
          if (!done && stillThisTurn && ++tries < 6) timer = setTimeout(attempt, 600);
        })
        .catch(console.error);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [turnOver, roomCode]);

  const roundOver = playing && roundSeconds === 0 ? roomData!.round : null;
  useEffect(() => {
    if (roundOver === null || !roomCode) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      expireRound(roomCode, roundOver)
        .then((done) => {
          const latest = roomDataRef.current;
          const stillThisRound = latest?.status === 'playing' && latest.round === roundOver;
          // Up to ~12s: a guess sent at the last second may take a few to be judged.
          if (!done && stillThisRound && ++tries < 12) timer = setTimeout(attempt, 1000);
        })
        .catch((e) => {
          console.error(e);
          setSyncError({ message: 'Could not end the round. Check your connection.', retry: attempt });
        });
    };
    attempt();
    return () => clearTimeout(timer);
  }, [roundOver, roomCode]);

  // Knowers fetch this round's word from round_secrets. The Guesser never asks — and RLS
  // would return nothing if they did — so the answer never reaches their device.
  const [target, setTarget] = useState<({ round: number } & SecretWord) | null>(null);
  // The round whose meaning this Knower has open: it stays open as the turn passes back and forth.
  const [meaningOpenRound, setMeaningOpenRound] = useState<number | null>(null);

  // The word this Knower just sent, shown at once (in the feed, with the turn passed) rather
  // than after the server round trip. It only counts while the server is still on the turn it
  // was sent for (see `pending` below); a rejection clears it.
  const [sentWord, setSentWord] = useState<{ round: number; turnIndex: number; word: string } | null>(null);
  // Why the server refused this Knower's last word, shown on their screen.
  const [wordNotice, setWordNotice] = useState<{ message: string } | null>(null);
  useEffect(() => setWordNotice(null), [roomData?.round, roomData?.turnIndex]);
  const isGuesserThisRound = !!roomData && roomData.guesserUid === uid;
  useEffect(() => {
    if (!roomCode || !uid || roomData?.status !== 'playing' || isGuesserThisRound) return;
    const round = roomData.round;
    if (target?.round === round) return;
    let cancelled = false;
    const attemptFetch = () => {
      fetchTargetWord(roomCode, round)
        .then((secret) => {
          if (cancelled) return;
          if (!secret) throw new Error(`no target word visible for round ${round}`);
          setTarget({ round, ...secret });
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

  // First-game tips: one per round, chosen when the round starts, each shown once per device.
  const [tip, setTip] = useState<{ round: number; id: TipId } | null>(null);
  const myRole = roomData && uid ? roomData.players[uid]?.role : undefined;
  useEffect(() => {
    if (playingRound === null || !myRole) return;
    const settings = useSettingsStore.getState();
    if (settings.firstGameDone) return;
    const id = pickTip(myRole, settings.tipsSeen);
    if (!id) return;
    settings.markTipSeen(id);
    setTip({ round: playingRound, id });
    // Once per round; the role is read when the round starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingRound]);
  useEffect(() => {
    if (roomData?.status === 'gameover') useSettingsStore.getState().markFirstGameDone();
  }, [roomData?.status]);

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
        offLimits={lastEntry.forbidden}
        guess={lastEntry.guess ?? null}
        guesserName={roomData.players[lastEntry.guesserUid]?.name ?? 'The Guesser'}
        isMyGuess={lastEntry.guesserUid === uid}
        feed={lastEntry.feed ?? (lastEntry.chain ?? []).map((text): FeedEntry => ({ kind: 'word', text, by: '' }))}
        players={roomData.players}
        durationMs={lastEntry.durationMs}
        wordCount={lastEntry.wordCount}
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
          duo={roomData.mode === 'duo'}
          onReport={onReport}
          onShare={async () => {
            try {
              const cardId = await createShareCard(roomCode!);
              const won = history.filter((h) => h.outcome === 'won').length;
              // A game ended early is scored out of the rounds played, as on the card.
              const outOf = Math.min(history.length, roomData.maxRounds);
              return await shareCard(cardId, `We scored ${won}/${outOf} on Yappa! Can you beat it?`);
            } catch (e) {
              console.error(e);
              return 'failed';
            }
          }}
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
    const knowers = knowerOrder(roomData).filter((k) => k !== uid);
    return renderWithDisconnectOverlay(
      <RoundIntroScreen
        round={roomData.round}
        isGuesser={isGuesser}
        category={roomData.category}
        knowerNames={knowers.map((k) => roomData.players[k]?.name ?? 'Knower')}
        roundLength={clocks.roundSeconds}
        clueBudget={roomData.mode === 'duo' ? roomData.clueBudget ?? DUO_CLUES : undefined}
        targetWord={target?.round === roomData.round ? target.word : null}
        offLimits={target?.round === roomData.round ? target.forbidden : undefined}
        onDismiss={() => setIntroRound(null)}
      />
    );
  }

  const serverFeed: FeedEntry[] = roomData.feed ?? [];
  const turnIndex = roomData.turnIndex ?? 0;
  const pending =
    sentWord && sentWord.round === roomData.round && sentWord.turnIndex === turnIndex ? sentWord : null;
  const feed: FeedEntry[] = pending ? [...serverFeed, { kind: 'word', text: pending.word, by: uid }] : serverFeed;
  const typing = roomData.typing ?? {};
  // Duo: the Knower's clue budget, counting a word still on its way.
  const duo = roomData.mode === 'duo';
  const clues = duo
    ? { used: feed.filter((e) => e.kind === 'word').length, budget: roomData.clueBudget ?? DUO_CLUES }
    : undefined;

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
  const offLimits = target?.forbidden ?? [];
  const meaning = {
    text: target?.meaning ?? '',
    open: meaningOpenRound === roomData.round,
    onToggle: () => setMeaningOpenRound((r) => (r === roomData.round ? null : roomData.round)),
  };
  const roundTip =
    tip?.round === roomData.round ? { text: TIPS[tip.id], onDismiss: () => setTip(null) } : undefined;

  // What just happened, for the Knowers: a wrong guess to steer away from, or a turn that ran out.
  const latestEntry = serverFeed[serverFeed.length - 1];
  const nameOf = (u: string) => roomData.players[u]?.name ?? 'Your partner';
  const knowerPrompt = (meActive: boolean): { text: string; tone: 'calm' | 'alert' } | undefined => {
    if (latestEntry?.kind === 'guess' && !latestEntry.correct) return { text: `Not ${latestEntry.text}! Steer them away`, tone: 'alert' };
    if (latestEntry?.kind === 'skip') {
      return meActive
        ? { text: `${nameOf(latestEntry.by)} was too slow. Your turn!`, tone: 'alert' }
        : { text: `Too slow! ${nameOf(roomData.activeKnowerUid)}’s turn`, tone: 'alert' };
    }
    if (!meActive) return undefined;
    return { text: duo ? 'Make every clue count' : 'Your turn! Add a word that helps', tone: 'calm' };
  };

  // Active Knower: it's my turn to add a word (in duo it always is, even while a word is on its way)
  if (myPlayer.role === 'knower' && roomData.activeKnowerUid === uid && (!pending || duo)) {
    return renderWithDisconnectOverlay(
      <KnowerActiveScreen
        round={roomData.round}
        maxRounds={roomData.maxRounds}
        targetWord={targetWord}
        meaning={meaning}
        offLimits={offLimits}
        prompt={knowerPrompt(true)}
        tip={roundTip}
        category={roomData.category}
        feed={feed}
        players={roomData.players}
        turnSeconds={turnSeconds}
        roundSeconds={roundSeconds}
        roundLength={clocks.roundSeconds}
        notice={wordNotice}
        clues={clues}
        sending={!!pending}
        onSubmitWord={(word) => {
          const round = roomData.round;
          const turn = turnIndex;
          const attemptSubmit = () => {
            setSentWord({ round, turnIndex: turn, word });
            submitWord(roomCode!, round, turn, word).catch((e) => {
              console.error(`Word not sent: ${errorText(e)}`, e);
              setSentWord(null); // hand the turn back on screen
              const rejection = wordRejection(e);
              if (rejection) {
                const latest = roomDataRef.current;
                const stillMine = latest?.status === 'playing' && latest.round === round && latest.activeKnowerUid === uid;
                // Still my turn: say why on my screen. The turn moved on: say so in a banner.
                if (stillMine) setWordNotice({ message: WORD_REJECTED[rejection] });
                else if (latest?.status === 'playing') setSyncError({ message: WORD_REJECTED[rejection] });
                return;
              }
              // Only offer a retry while it's still this player's turn in this round:
              // otherwise retrying a stale move can't help.
              const latest = roomDataRef.current;
              if (latest?.status === 'playing' && latest.round === round && latest.activeKnowerUid === uid) {
                setSyncError({ message: 'Your word might not have sent. Check your connection.', retry: attemptSubmit });
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

  // Waiting Knower: another Knower is active (or about to be, while my sent word is in flight)
  if (myPlayer.role === 'knower') {
    const partnerUid = pending ? nextKnower(roomData, uid) : roomData.activeKnowerUid;
    const partner = roomData.players[partnerUid];
    const upNextUid = nextKnower(roomData, partnerUid);
    return renderWithDisconnectOverlay(
      <KnowerWaitingScreen
        round={roomData.round}
        maxRounds={roomData.maxRounds}
        targetWord={targetWord}
        meaning={meaning}
        offLimits={offLimits}
        prompt={pending ? undefined : knowerPrompt(false)}
        tip={roundTip}
        category={roomData.category}
        feed={feed}
        players={roomData.players}
        partnerName={partner?.name ?? 'Partner'}
        partnerColor={partner?.avatarColor}
        partnerIsTyping={!!typing[partnerUid]}
        upNextName={upNextUid === uid ? undefined : roomData.players[upNextUid]?.name}
        // The partner's turn starts fresh; the clock is still on mine until my word lands.
        turnSeconds={pending ? clocks.turnSeconds : turnSeconds}
        roundSeconds={roundSeconds}
        roundLength={clocks.roundSeconds}
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
      feed={feed}
      players={roomData.players}
      activeKnowerName={activeKnower?.name ?? 'Knower'}
      knowerIsTyping={!!typing[roomData.activeKnowerUid]}
      roundSeconds={roundSeconds}
      roundLength={clocks.roundSeconds}
      tip={roundTip}
      clues={clues}
      // Throws if the guess couldn't be sent: GuesserScreen lets them retry.
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
