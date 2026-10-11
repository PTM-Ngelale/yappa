import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { playSound } from '../src/audio/sounds';
import { SoundToggles } from '../src/components/SoundToggles';
import { Avatar, Eyebrow, IconButton, OUTLINE, Pill, Screen, Sticker, StickerButton } from '../src/components/ui';
import { SUPABASE_CONFIGURED } from '../src/supabase/config';
import type { RoomData } from '../src/supabase/room';
import { useGameStore, type RoomPlayer } from '../src/store/gameStore';
import { usePlayerStore } from '../src/store/playerStore';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../src/theme';

const MAX_PLAYERS = 3;

export default function LobbyScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const { roomCode, isHost: createdRoom, setPlayers, reset: resetGameStore } = useGameStore();
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

  // Read from the room, not just who created it — the host role passes on if the host
  // leaves (see leave_room() in migration 005).
  const isHost = roomData ? roomData.hostUid === uid : createdRoom;

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

  // Chime when someone joins or leaves — skipping the first snapshot, which is just
  // everyone already here.
  const playerCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomData) return;
    const count = Object.keys(roomData.players).length;
    const before = playerCountRef.current;
    playerCountRef.current = count;
    if (before === null || count === before) return;
    playSound(count > before ? 'join' : 'leave');
  }, [roomData]);

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

  function handleShare() {
    if (!roomCode) return;
    Share.share({ message: `Join my Yappa game! Room code: ${roomCode}` }).catch(console.error);
  }

  const canStart = isHost && players.length === MAX_PLAYERS;
  const emptySlots = MAX_PLAYERS - players.length;
  const code = (roomCode ?? '----').split('');

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <IconButton icon="arrow-left" onPress={handleLeave} accessibilityLabel="Leave lobby" />
        </View>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Lobby
        </Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          <SoundToggles />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Sticker radius={26} offset={6} contentStyle={styles.codeCard}>
          <Eyebrow>Room code</Eyebrow>
          <View style={styles.tiles} accessible accessibilityLabel={`Room code ${code.join(' ')}`}>
            {code.map((ch, i) => (
              <View key={i} style={styles.tile}>
                <Text style={styles.tileText}>{ch}</Text>
              </View>
            ))}
          </View>
          {roomCode && (
            <StickerButton
              label="Share code"
              icon="share-2"
              variant="card"
              height={46}
              fontSize={16}
              onPress={handleShare}
            />
          )}
        </Sticker>

        <View style={styles.section}>
          <View style={styles.sectionTop}>
            <Eyebrow>Players</Eyebrow>
            <Text style={styles.count}>
              {players.length} / {MAX_PLAYERS}
            </Text>
          </View>
          {players.map((player) => (
            <Sticker key={player.uid} radius={20} contentStyle={styles.playerRow}>
              <Avatar name={player.name} color={player.avatarColor} />
              <Text style={styles.playerName} numberOfLines={1}>
                {player.name}
                {player.uid === (uid ?? 'local') && <Text style={styles.you}> (you)</Text>}
              </Text>
              {roomData?.hostUid === player.uid && (
                <Pill label="Host" bg={p.yellow} fg={p.onYellow} size={13} style={styles.hostPill} />
              )}
            </Sticker>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.emptySlot}>
              <View style={styles.emptyAvatar}>
                <Feather name="plus" size={18} color={p.ink} />
              </View>
              <Text style={styles.emptyText}>Waiting for a friend…</Text>
            </View>
          ))}
        </View>

        {!isHost && (
          <Text style={styles.note}>Waiting for the host to start the game…</Text>
        )}

        {!SUPABASE_CONFIGURED && (
          <Text style={styles.configNotice}>
            Supabase not configured — other players won't appear until config is added.
          </Text>
        )}
      </ScrollView>

      {isHost && (
        <View style={styles.footer}>
          <StickerButton
            label="Start game"
            height={64}
            onPress={handleStart}
            disabled={!canStart}
            sound="roundStart"
          />
          <Text style={styles.note}>
            {canStart
              ? 'Everyone’s here — let’s go!'
              : `Needs exactly 3 players, ${emptySlots} more to go`}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screen,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerSide: { width: 104 },
    headerRight: { alignItems: 'flex-end' },
    headerTitle: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    body: { paddingHorizontal: spacing.screen, paddingTop: 14, paddingBottom: 24, gap: 20 },
    codeCard: { alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14 },
    tiles: { flexDirection: 'row', gap: 8 },
    tile: {
      width: 58,
      height: 70,
      borderRadius: radius.md,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.yellow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileText: { fontFamily: fonts.black, fontSize: 42, color: p.onYellow },
    section: { gap: 10 },
    sectionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    count: { fontFamily: fonts.black, fontSize: 16, color: p.ink },
    playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    playerName: { flex: 1, fontFamily: fonts.bold, fontSize: 20, color: p.ink },
    you: { fontFamily: fonts.medium },
    hostPill: { alignSelf: 'center' },
    emptySlot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: OUTLINE,
      borderStyle: 'dashed',
      borderColor: p.ink,
      borderRadius: 20,
      backgroundColor: p.ghost,
      marginRight: 4,
    },
    emptyAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: OUTLINE,
      borderStyle: 'dashed',
      borderColor: p.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: { fontFamily: fonts.bold, fontSize: 18, color: p.ink },
    note: { ...type.body, fontFamily: fonts.bold, color: p.ink, textAlign: 'center' },
    configNotice: { ...type.small, fontSize: 12, color: p.muted, textAlign: 'center' },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 14, gap: 8 },
  });
