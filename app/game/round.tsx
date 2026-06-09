import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { endRound, setTyping, startRound, submitWord, tickTimer } from '../../src/firebase/round';
import { listenToRoom, type RoomData } from '../../src/firebase/room';
import { GuesserScreen } from '../../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../../src/screens/KnowerWaitingScreen';
import { useGameStore } from '../../src/store/gameStore';
import { usePlayerStore } from '../../src/store/playerStore';
import { colors, radius, spacing, typography } from '../../src/theme';

const ROUND_SECONDS = 30;

export default function RoundScreen() {
  const { roomCode, isHost } = useGameStore();
  const { uid } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);

  // Keep a ref for the timer interval closure — avoids stale secondsRemaining
  const roomDataRef = useRef<RoomData | null>(null);
  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);

  // Subscribe to room in real time
  useEffect(() => {
    if (!roomCode) return;
    return listenToRoom(roomCode, setRoomData);
  }, [roomCode]);

  // Host: kick off round init once (guard against re-fires)
  const roundInitiated = useRef(false);
  useEffect(() => {
    if (!isHost || !roomData || roomData.status !== 'lobby' || roundInitiated.current) return;
    roundInitiated.current = true;
    const players = Object.values(roomData.players);
    startRound(roomCode!, players).catch(console.error);
  }, [isHost, roomData?.status]);

  // Host: drive the timer — one interval per playing session
  useEffect(() => {
    if (!isHost || roomData?.status !== 'playing') return;
    const interval = setInterval(() => {
      const current = roomDataRef.current;
      if (!current || current.status !== 'playing') return;
      const next = Math.max(0, current.secondsRemaining - 1);
      if (next === 0) {
        endRound(roomCode!).catch(console.error);
      } else {
        tickTimer(roomCode!, next).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isHost, roomData?.status]);

  // Loading — waiting for RTDB snapshot
  if (!roomData || !uid) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // Initializing — host is setting up the round
  if (roomData.status === 'lobby') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.statusText}>Starting round…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Round ended
  if (roomData.status === 'ended') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.endedHeadline}>Round over!</Text>
          <Text style={styles.endedSub}>The word was</Text>
          <View style={styles.revealCard}>
            <Text style={styles.revealWord}>{roomData.targetWord}</Text>
          </View>
          <Pressable
            onPress={() => router.replace('/lobby')}
            accessibilityRole="button"
            style={({ pressed }) => pressed && styles.btnPressed}
          >
            <View style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back to Lobby</Text>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Waiting for player record to appear (rare race)
  const myPlayer = roomData.players[uid];
  if (!myPlayer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
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
    return (
      <KnowerActiveScreen
        targetWord={roomData.targetWord}
        category={roomData.category}
        chain={chain}
        durationSeconds={ROUND_SECONDS}
        secondsRemaining={roomData.secondsRemaining}
        onSubmitWord={(word) => {
          submitWord(roomCode!, chain, word, nextKnowerUid, uid).catch(console.error);
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
    return (
      <KnowerWaitingScreen
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
  return (
    <GuesserScreen
      category={roomData.category}
      chain={chain}
      activeKnowerName={activeKnower?.name ?? 'Knower'}
      knowerIsTyping={!!typing[roomData.activeKnowerUid]}
      durationSeconds={ROUND_SECONDS}
      secondsRemaining={roomData.secondsRemaining}
      onGuess={(guess) => {
        const correct =
          guess.toLowerCase().trim() === roomData.targetWord.toLowerCase().trim();
        if (correct) {
          endRound(roomCode!).catch(console.error);
        }
        // Incorrect guesses are silently ignored for now (Phase 3 adds feedback)
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.containerMargin,
    gap: spacing.stackLg,
  },
  statusText: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  endedHeadline: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 40,
    color: colors.primary,
    letterSpacing: -1,
  },
  endedSub: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  revealCard: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.stackLg,
    paddingVertical: spacing.stackMd,
    borderRadius: radius.xl,
  },
  revealWord: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 36,
    color: colors.onPrimaryContainer,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  backBtn: {
    height: 56,
    paddingHorizontal: spacing.stackLg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 18,
    color: colors.onPrimary,
  },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
