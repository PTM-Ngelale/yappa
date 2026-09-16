import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SUPABASE_CONFIGURED } from '../src/supabase/config';
import type { RoomData } from '../src/supabase/room';
import { useGameStore, type RoomPlayer } from '../src/store/gameStore';
import { usePlayerStore } from '../src/store/playerStore';
import { colors, elevation, radius, spacing, typography } from '../src/theme';

const MAX_PLAYERS = 3;

export default function LobbyScreen() {
  const { roomCode, isHost, setPlayers, reset: resetGameStore } = useGameStore();
  const { name, uid, avatarColor } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);

  // Build local player list for display when Supabase isn't configured
  const localPlayer: RoomPlayer = {
    uid: uid ?? 'local',
    name: name.trim() || 'You',
    avatarColor,
    role: 'knower',
    lastSeenAt: Date.now(),
  };

  const players: RoomPlayer[] = roomData
    ? Object.values(roomData.players)
    : [localPlayer];

  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !roomCode) return;
    let unsub: (() => void) | undefined;
    import('../src/supabase/room').then(({ listenToRoom }) => {
      unsub = listenToRoom(roomCode, (data) => {
        setRoomData(data);
        if (data) setPlayers(Object.values(data.players));
      });
    });
    return () => unsub?.();
  }, [roomCode, setPlayers]);

  // Non-host: navigate to round screen when host starts the game
  useEffect(() => {
    if (!isHost && roomData?.status === 'playing') {
      router.replace('/game/round');
    }
  }, [isHost, roomData?.status]);

  function handleStart() {
    router.replace('/game/round');
  }

  function handleLeave() {
    if (SUPABASE_CONFIGURED && roomCode && uid) {
      import('../src/supabase/room').then(({ leaveRoom }) =>
        leaveRoom(roomCode, uid).catch(console.error)
      );
      import('../src/supabase/presence').then(({ stopPresence }) => stopPresence());
    }
    resetGameStore();
    router.back();
  }

  const canStart = isHost && players.length === MAX_PLAYERS;
  const emptySlots = MAX_PLAYERS - players.length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={handleLeave}
          accessibilityRole="button"
          accessibilityLabel="Leave lobby"
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Lobby</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Room code */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>ROOM CODE</Text>
          <Text style={styles.codeText}>{roomCode ?? '----'}</Text>
          <Text style={styles.codeHint}>Share this with your friends</Text>
        </View>

        {/* Player slots */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PLAYERS ({players.length}/{MAX_PLAYERS})</Text>
          <View style={styles.playerList}>
            {players.map((p) => (
              <PlayerRow key={p.uid} player={p} isYou={p.uid === (uid ?? 'local')} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptySlot key={`empty-${i}`} />
            ))}
          </View>
        </View>

        {!isHost && (
          <Text style={styles.waitingText}>Waiting for host to start the game…</Text>
        )}

        {!SUPABASE_CONFIGURED && (
          <Text style={styles.configNotice}>
            Supabase not configured — other players won't appear until config is added.
          </Text>
        )}
      </ScrollView>

      {/* Fixed footer — host only */}
      {isHost && (
        <View style={styles.footer}>
          {!canStart && (
            <Text style={styles.waitingText}>
              Waiting for {emptySlots} more player{emptySlots !== 1 ? 's' : ''}…
            </Text>
          )}
          <Pressable
            onPress={handleStart}
            disabled={!canStart}
            accessibilityRole="button"
            accessibilityLabel="Start game"
            style={({ pressed }) => pressed && canStart && styles.btnPressed}
          >
            <View style={[styles.startBtn, !canStart && styles.startBtnDisabled]}>
              <Text style={[styles.startBtnText, !canStart && styles.startBtnTextDisabled]}>
                Start Game
              </Text>
            </View>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function PlayerRow({ player, isYou }: { player: RoomPlayer; isYou: boolean }) {
  return (
    <View style={styles.playerRow}>
      <View style={[styles.avatar, { backgroundColor: player.avatarColor }]}>
        <Text style={styles.avatarText}>{player.name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.playerName}>
        {player.name}{isYou ? ' (you)' : ''}
      </Text>
    </View>
  );
}

function EmptySlot() {
  return (
    <View style={[styles.playerRow, styles.emptySlot]}>
      <View style={[styles.avatar, styles.avatarEmpty]}>
        <Text style={styles.avatarEmptyText}>?</Text>
      </View>
      <Text style={styles.emptyText}>Waiting for player…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.containerMargin,
    height: 64,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.headlineLgMobile, color: colors.primary },
  backBtn: { minWidth: 64 },
  backText: { ...typography.bodyMd, color: colors.primary },
  flex: { flex: 1 },
  body: {
    padding: spacing.containerMargin,
    gap: spacing.stackLg,
    paddingBottom: spacing.stackLg,
  },
  codeCard: {
    ...elevation.card,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: spacing.stackLg,
    paddingHorizontal: spacing.containerMargin,
    gap: spacing.stackSm,
  },
  codeLabel: {
    ...typography.labelXl,
    fontSize: 12,
    color: colors.onPrimaryContainer,
    letterSpacing: 2,
    opacity: 0.75,
  },
  codeText: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 56,
    lineHeight: 64,
    color: colors.onPrimaryContainer,
    letterSpacing: 16,
  },
  codeHint: { ...typography.bodyMd, color: colors.onPrimaryContainer, opacity: 0.7 },
  section: { gap: spacing.stackMd },
  sectionLabel: {
    ...typography.labelXl,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
  },
  playerList: { gap: spacing.stackSm },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.stackMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.stackMd,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  emptySlot: { opacity: 0.45 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 18,
    color: '#fff',
  },
  avatarEmpty: { backgroundColor: colors.surfaceContainerHigh },
  avatarEmptyText: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  playerName: { ...typography.bodyLg, color: colors.onSurface },
  emptyText: { ...typography.bodyMd, color: colors.onSurfaceVariant, fontStyle: 'italic' },
  footer: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackMd,
    paddingTop: spacing.stackSm,
    gap: spacing.stackMd,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  startBtn: {
    width: '100%',
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.card,
    shadowColor: colors.primary,
  },
  startBtnDisabled: { backgroundColor: colors.surfaceContainerHigh, shadowOpacity: 0, elevation: 0 },
  startBtnText: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 20,
    color: colors.onPrimary,
  },
  startBtnTextDisabled: { color: colors.onSurfaceVariant },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  waitingText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center' },
  configNotice: {
    ...typography.bodyMd,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    opacity: 0.6,
  },
});
