import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { playSound } from '../src/audio/sounds';
import { Pressable } from '../src/components/Pressable';
import { ReportSheet } from '../src/components/ReportSheet';
import { SoundToggles } from '../src/components/SoundToggles';
import { shareRoom } from '../src/lib/shareRoom';
import { Avatar, Eyebrow, IconButton, OUTLINE, Pill, Screen, Sticker, StickerButton } from '../src/components/ui';
import { DUO_CLUES } from '../src/game/config';
import { MAX_PLAYERS, MIN_PLAYERS, PUBLIC_PLAYERS, roundsFor, TEAM_PLAYERS } from '../src/game/players';
import { SUPABASE_CONFIGURED } from '../src/supabase/config';
import type { RoomData } from '../src/supabase/room';
import { useGameStore, type RoomPlayer } from '../src/store/gameStore';
import { usePlayerStore } from '../src/store/playerStore';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../src/theme';

/** A full public lobby starts itself after this many seconds. */
const AUTO_START_SECONDS = 5;

export default function LobbyScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const { roomCode, isHost: createdRoom, setPlayers, reset: resetGameStore } = useGameStore();
  const { name, uid, avatarColor } = usePlayerStore();
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [reportFor, setReportFor] = useState<RoomPlayer | null>(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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

  // "Still here" every 15s — public lobbies drop players who stop sending these, so Play
  // online never matches anyone into a room whose players have gone.
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !roomCode || roomData?.status !== 'lobby') return;
    let stopped = false;
    const beat = () =>
      import('../src/supabase/room').then(({ lobbyHeartbeat }) => {
        if (!stopped) lobbyHeartbeat(roomCode).catch(console.error);
      });
    beat();
    const id = setInterval(beat, 15000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [roomCode, roomData?.status]);

  // A full public lobby starts by itself: nobody waits on a stranger to tap Start.
  // Everyone sees the countdown; the host's app does the starting.
  const isPublic = !!roomData?.isPublic;
  // Play online seats 3; a private room seats up to 5 and can start from 2 (duo).
  const seats = isPublic ? PUBLIC_PLAYERS : MAX_PLAYERS;
  const isFull = players.length >= seats;
  useEffect(() => {
    if (!isPublic || !isFull || roomData?.status !== 'lobby') {
      setCountdown(null);
      return;
    }
    let left = AUTO_START_SECONDS;
    setCountdown(left);
    const id = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [isPublic, isFull, roomData?.status]);

  useEffect(() => {
    if (countdown === 0 && isHost) {
      playSound('roundStart');
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, isHost]);

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
    if (router.canGoBack()) router.back();
    else router.replace('/');
    resetGameStore();
  }

  async function handleTogglePublic() {
    if (!roomCode) return;
    setTogglingPublic(true);
    try {
      const { setRoomPublic } = await import('../src/supabase/room');
      await setRoomPublic(roomCode, !isPublic);
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingPublic(false);
    }
  }

  // Native always opens the share sheet; on web, browsers without one copy a link instead.
  function handleShare() {
    if (!roomCode) return;
    shareRoom(roomCode).then((result) => {
      if (result !== 'copied') return;
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  const enough = players.length >= MIN_PLAYERS;
  const canStart = isHost && enough && players.length <= MAX_PLAYERS;
  // Seats the game still needs; a private room with enough players shows the rest as optional.
  const emptySlots = Math.max(0, (isPublic ? PUBLIC_PLAYERS : MIN_PLAYERS) - players.length);
  const spareSeats = !isPublic && enough ? MAX_PLAYERS - players.length : 0;
  const code = (roomCode ?? '----').split('');

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <IconButton icon="arrow-left" onPress={handleLeave} accessibilityLabel="Leave lobby" />
        </View>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {isPublic ? 'Online lobby' : 'Lobby'}
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
          {linkCopied && (
            <Text style={styles.copied} accessibilityLiveRegion="polite">
              Link copied
            </Text>
          )}
        </Sticker>

        <View style={styles.section}>
          <View style={styles.sectionTop}>
            <Eyebrow>Players</Eyebrow>
            <Text style={styles.count}>
              {players.length} / {seats}
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
              {isPublic && player.uid !== uid && (
                <Pressable
                  onPress={() => setReportFor(player)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${player.name}`}
                  style={styles.flag}
                >
                  <Feather name="flag" size={18} color={p.muted} />
                </Pressable>
              )}
            </Sticker>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.emptySlot}>
              <View style={styles.emptyAvatar}>
                <Feather name="plus" size={18} color={p.ink} />
              </View>
              <Text style={styles.emptyText}>
                {isPublic ? 'Finding a player…' : 'Waiting for a friend…'}
              </Text>
            </View>
          ))}
          {spareSeats > 0 && (
            <View style={[styles.emptySlot, styles.spareSlot]}>
              <View style={styles.emptyAvatar}>
                <Feather name="plus" size={18} color={p.ink} />
              </View>
              <Text style={styles.emptyText}>Room for {spareSeats} more</Text>
            </View>
          )}
        </View>

        {/* Play online fills a room to 3, so it's offered only while there's a seat to fill */}
        {isHost && roomData?.status === 'lobby' && (isPublic || players.length < PUBLIC_PLAYERS) && (
          <StickerButton
            label={isPublic ? 'Stop finding players' : 'Find players online'}
            icon={isPublic ? 'x' : 'globe'}
            variant={isPublic ? 'card' : 'blue'}
            height={50}
            fontSize={17}
            loading={togglingPublic}
            onPress={handleTogglePublic}
            accessibilityLabel={isPublic ? 'Stop finding players online' : 'Find players online to fill the empty seats'}
          />
        )}

        {countdown !== null ? (
          <Text style={styles.note} accessibilityLiveRegion="polite">
            Everyone’s here — starting in {Math.max(countdown, 0)}…
          </Text>
        ) : isPublic ? (
          <Text style={styles.note}>
            Looking for players online. Friends can still join with the code. The game starts by
            itself when it’s full.
          </Text>
        ) : (
          !isHost && <Text style={styles.note}>Waiting for the host to start the game…</Text>
        )}

        {!SUPABASE_CONFIGURED && (
          <Text style={styles.configNotice}>
            Supabase not configured — other players won't appear until config is added.
          </Text>
        )}
      </ScrollView>

      {isHost && !isPublic && (
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
              ? players.length < TEAM_PLAYERS
                ? `Duo: ${roundsFor(players.length)} rounds, ${DUO_CLUES} clues a round. Let’s go!`
                : `${players.length} players, ${roundsFor(players.length)} rounds. Let’s go!`
              : `Needs at least ${MIN_PLAYERS} players, ${emptySlots} more to go`}
          </Text>
        </View>
      )}
      {roomCode && (
        <ReportSheet
          visible={reportFor !== null}
          roomCode={roomCode}
          players={reportFor ? [reportFor] : []}
          onClose={() => setReportFor(null)}
        />
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
    flag: { padding: 6 },
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
    spareSlot: { opacity: 0.6 },
    note: { ...type.body, fontFamily: fonts.bold, color: p.ink, textAlign: 'center' },
    copied: { ...type.small, fontFamily: fonts.bold, color: p.ink, textAlign: 'center' },
    configNotice: { ...type.small, fontSize: 12, color: p.muted, textAlign: 'center' },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 14, gap: 8 },
  });
