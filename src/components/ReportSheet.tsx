import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { ReportReason } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../theme';
import { Pressable } from './Pressable';
import { Avatar, Sticker, StickerButton } from './ui';

const REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'name', label: 'Offensive name' },
  { reason: 'words', label: 'Offensive words' },
  { reason: 'cheating', label: 'Cheating or giving away the word' },
  { reason: 'other', label: 'Something else' },
];

interface ReportSheetProps {
  visible: boolean;
  roomCode: string;
  /** Who can be reported — everyone but you. With one player, the picker step is skipped. */
  players: RoomPlayer[];
  onClose: () => void;
}

/** Report a player in a public game: pick who (if needed), then why. */
export function ReportSheet({ visible, roomCode, players, onClose }: ReportSheetProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const [target, setTarget] = useState<RoomPlayer | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Start fresh each time it opens. (Only on open: `players` is rebuilt on every room update.)
  const onlyPlayer = players.length === 1 ? players[0] : null;
  useEffect(() => {
    if (!visible) return;
    setTarget(onlyPlayer);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function send(reason: ReportReason) {
    if (!target) return;
    setStatus('sending');
    try {
      const { reportPlayer } = await import('../supabase/room');
      await reportPlayer(roomCode, target.uid, reason);
      setStatus('sent');
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <Sticker radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
          {status === 'sent' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">Thanks for telling us</Text>
              <Text style={styles.body}>
                We’ll review what happened in this game. If you’d rather not keep playing, you can leave
                at any time.
              </Text>
              <StickerButton label="Done" variant="card" height={52} fontSize={18} onPress={onClose} />
            </>
          ) : !target ? (
            <>
              <Text style={styles.title} accessibilityRole="header">Report a player</Text>
              <Text style={styles.body}>Who are you reporting?</Text>
              {players.map((pl) => (
                <Pressable
                  key={pl.uid}
                  onPress={() => setTarget(pl)}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${pl.name}`}
                  style={styles.option}
                >
                  <Avatar name={pl.name} color={pl.avatarColor} size={36} />
                  <Text style={styles.optionText} numberOfLines={1}>{pl.name}</Text>
                </Pressable>
              ))}
              <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                Report {target.name}
              </Text>
              <Text style={styles.body}>What happened?</Text>
              {REASONS.map(({ reason, label }) => (
                <Pressable
                  key={reason}
                  onPress={() => send(reason)}
                  disabled={status === 'sending'}
                  accessibilityRole="button"
                  style={styles.option}
                >
                  <Text style={styles.optionText}>{label}</Text>
                </Pressable>
              ))}
              {status === 'error' && (
                <Text style={[styles.body, { color: p.danger }]} accessibilityLiveRegion="assertive">
                  Couldn’t send the report — check your connection and try again.
                </Text>
              )}
              <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </Sticker>
      </View>
    </Modal>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: p.scrim, justifyContent: 'center', padding: spacing.screen },
    cardWrap: { alignSelf: 'stretch' },
    card: { padding: 20, gap: 10 },
    title: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    body: { ...type.body, color: p.ink },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 3,
      borderColor: p.line,
      borderRadius: 16,
      backgroundColor: p.ghost,
    },
    optionText: { flex: 1, fontFamily: fonts.bold, fontSize: 18, color: p.ink },
    cancel: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
    cancelText: { fontFamily: fonts.bold, fontSize: 16, color: p.muted },
  });
