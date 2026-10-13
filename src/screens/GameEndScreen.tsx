import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { verdict } from '../lib/gameSummary';
import type { ShareResult } from '../lib/shareRoom';
import type { RoundHistoryEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { Pressable } from '../components/Pressable';
import { Eyebrow, Screen, ScreenBody, Sticker, StickerButton, useShortScreen } from '../components/ui';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../theme';

interface GameEndScreenProps {
  history: RoundHistoryEntry[];
  players: Record<string, RoomPlayer>;
  maxRounds: number;
  onPlayAgain: () => void;
  onBackToHome: () => void;
  /** Public games only: opens the report sheet. */
  onReport?: () => void;
  /** Shares a card of this game (a link whose preview is the score and best chain). */
  onShare?: () => Promise<ShareResult>;
}

export function GameEndScreen({
  history,
  players,
  maxRounds,
  onPlayAgain,
  onBackToHome,
  onReport,
  onShare,
}: GameEndScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState('');

  const handleShare = async () => {
    if (!onShare || sharing) return;
    setSharing(true);
    setShareNote('');
    const result = await onShare();
    setSharing(false);
    if (result === 'copied') setShareNote('Link copied, paste it anywhere');
    else if (result === 'failed') setShareNote('Couldn’t share. Check your connection and try again.');
  };
  const sorted = [...history].sort((a, b) => a.round - b.round);
  const wonCount = sorted.filter((h) => h.outcome === 'won').length;

  return (
    <Screen>
      <ScreenBody>
        <View style={styles.hero}>
          <Eyebrow>Game over</Eyebrow>
          <Sticker radius={28} offset={6} style={styles.scoreWrap} contentStyle={styles.score}>
            <Text style={[styles.scoreBig, short && styles.scoreBigCompact]} accessibilityLabel={`${wonCount} of ${maxRounds} rounds won`}>
              {wonCount}
            </Text>
            <Text style={styles.scoreOf} accessibilityElementsHidden importantForAccessibility="no">
              / {maxRounds}
            </Text>
          </Sticker>
          <Text style={styles.verdict} accessibilityRole="header">
            {verdict(wonCount, maxRounds)}
          </Text>
          {onShare && (
            <>
              <StickerButton
                label="Share results"
                icon="share-2"
                variant="blue"
                height={48}
                fontSize={18}
                loading={sharing}
                onPress={handleShare}
                accessibilityLabel="Share your results"
                style={styles.share}
              />
              {shareNote !== '' && (
                <Text style={styles.shareNote} accessibilityLiveRegion="polite">
                  {shareNote}
                </Text>
              )}
            </>
          )}
        </View>

        <Sticker style={styles.listWrap} radius={24} offset={5} contentStyle={styles.listCard}>
          <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {sorted.map((entry, i) => (
              <RoundRow
                key={entry.round}
                entry={entry}
                guesser={players[entry.guesserUid]}
                last={i === sorted.length - 1}
              />
            ))}
          </ScrollView>
        </Sticker>
      </ScreenBody>

      <View style={styles.footer}>
        <StickerButton label="Play again" height={64} onPress={onPlayAgain} />
        <StickerButton label="Back to home" variant="card" height={56} fontSize={19} onPress={onBackToHome} />
        {onReport && (
          <Pressable onPress={onReport} accessibilityRole="button" style={styles.report} sound={false}>
            <Feather name="flag" size={14} color={p.ink} />
            <Text style={styles.reportText}>Report a player</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function RoundRow({
  entry,
  guesser,
  last,
}: {
  entry: RoundHistoryEntry;
  guesser?: RoomPlayer;
  last: boolean;
}) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const won = entry.outcome === 'won';
  const words = entry.chain?.length ?? 0;
  const name = guesser?.name ?? 'Someone';
  const detail = won
    ? `${name} guessed`
    : entry.outcome === 'lost-timeout'
      ? 'Time ran out'
      : entry.guess
        ? `Guessed “${entry.guess}”`
        : 'Wrong guess';

  return (
    <View
      style={[styles.row, !last && styles.rowDivider]}
      accessible
      accessibilityLabel={`Round ${entry.round}, ${entry.targetWord}, ${won ? 'won' : 'lost'}. ${detail}. ${words} words.`}
    >
      <View style={[styles.badge, { backgroundColor: won ? p.blue : p.card }]}>
        <Feather name={won ? 'check' : 'x'} size={16} color={won ? p.onBlue : p.danger} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowWord}>{entry.targetWord}</Text>
        <Text style={styles.rowMeta}>
          Round {entry.round} · {detail} · {words} word{words === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    hero: { alignItems: 'center', gap: 8, paddingTop: 16, paddingHorizontal: spacing.screen },
    scoreWrap: { transform: [{ rotate: '-2deg' }] },
    score: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 26, paddingBottom: 6 },
    scoreBig: { fontFamily: fonts.black, fontSize: 92, lineHeight: 100, letterSpacing: -4, color: p.ink },
    scoreOf: { fontFamily: fonts.black, fontSize: 34, color: p.ink },
    verdict: { ...type.title, color: p.ink, marginTop: 4 },
    share: { alignSelf: 'center', minWidth: 220, marginTop: 6 },
    shareNote: { ...type.small, fontFamily: fonts.bold, color: p.ink, textAlign: 'center' },
    scoreBigCompact: { fontSize: 60, lineHeight: 68 },
    // At least a few rounds in view; the list scrolls inside the card.
    listWrap: { flex: 1, minHeight: 170, marginHorizontal: spacing.screen, marginTop: 16 },
    listCard: { flex: 1, paddingVertical: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    rowDivider: { borderBottomWidth: 2, borderBottomColor: p.divider },
    badge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: p.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowWord: { fontFamily: fonts.black, fontSize: 18, color: p.ink },
    rowMeta: { ...type.small, fontSize: 13, color: p.muted },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 16, paddingBottom: 14, gap: 12 },
    report: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 8 },
    reportText: { fontFamily: fonts.bold, fontSize: 14, color: p.ink, textDecorationLine: 'underline' },
  });

