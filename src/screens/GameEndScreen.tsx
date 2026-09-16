import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoundHistoryEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface GameEndScreenProps {
  history: RoundHistoryEntry[];
  players: Record<string, RoomPlayer>;
  maxRounds: number;
  onPlayAgain: () => void;
  onBackToHome: () => void;
}

export function GameEndScreen({
  history,
  players,
  maxRounds,
  onPlayAgain,
  onBackToHome,
}: GameEndScreenProps) {
  const sorted = [...history].sort((a, b) => a.round - b.round);
  const wonCount = sorted.filter((h) => h.outcome === 'won').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Match Results</Text>
      </View>

      <View style={styles.hero}>
        <Ionicons name="trophy" size={56} color={colors.primary} />
        <Text style={styles.heroTitle}>Game Over!</Text>
        <Text style={styles.heroSubtitle}>
          You won {wonCount} of {maxRounds} rounds!
        </Text>
      </View>

      <View style={styles.breakdownHeader}>
        <Text style={styles.breakdownTitle}>Round Breakdown</Text>
        <Text style={styles.breakdownCount}>{sorted.length} rounds</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {sorted.map((entry) => (
          <RoundRow key={entry.round} entry={entry} guesser={players[entry.guesserUid]} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onPlayAgain}
          accessibilityRole="button"
          accessibilityLabel="Play again"
          style={({ pressed }) => pressed && styles.btnPressed}
        >
          <View style={styles.playAgainBtn}>
            <Text style={styles.playAgainText}>Play Again</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onBackToHome}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          style={({ pressed }) => pressed && styles.btnPressed}
        >
          <View style={styles.homeBtn}>
            <Text style={styles.homeText}>Back to Home</Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function RoundRow({ entry, guesser }: { entry: RoundHistoryEntry; guesser?: RoomPlayer }) {
  const won = entry.outcome === 'won';
  const isTimeout = entry.outcome === 'lost-timeout';
  return (
    <View style={[styles.card, won ? styles.cardWon : styles.cardLost]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>Round {entry.round}</Text>
          </View>
          <Text style={[styles.cardTarget, !won && styles.cardTargetLost]}>
            {entry.targetWord}
          </Text>
        </View>
        <View style={[styles.outcomeBadge, won ? styles.outcomeBadgeWon : styles.outcomeBadgeLost]}>
          <Text style={[styles.outcomeBadgeText, won ? styles.outcomeTextWon : styles.outcomeTextLost]}>
            {won ? 'WON' : 'LOST'}
          </Text>
        </View>
      </View>

      <View style={styles.cardInfoRow}>
        <View style={styles.infoTile}>
          <View style={[styles.avatar, { backgroundColor: guesser?.avatarColor ?? colors.secondaryContainer }]}>
            <Text style={styles.avatarText}>
              {(guesser?.name ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>GUESSER</Text>
            <Text style={styles.infoValue}>{guesser?.name ?? 'Unknown'}</Text>
          </View>
        </View>

        <View style={styles.infoTile}>
          <Ionicons
            name={won ? 'link' : isTimeout ? 'time' : 'close-circle'}
            size={18}
            color={colors.onSurfaceVariant}
          />
          <View>
            <Text style={styles.infoLabel}>{won ? 'CHAIN' : 'REASON'}</Text>
            <Text style={styles.infoValue}>
              {won ? `${entry.chain.length} words` : isTimeout ? "Time's up" : 'Wrong guess'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMargin,
    height: 64,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.headlineLgMobile, color: colors.primary },
  hero: { alignItems: 'center', gap: spacing.stackSm, paddingTop: spacing.stackMd, paddingBottom: spacing.stackLg },
  heroTitle: { ...typography.displayLg, color: colors.primary },
  heroSubtitle: { ...typography.headlineLgMobile, color: colors.onSurfaceVariant },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackSm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
    marginHorizontal: spacing.containerMargin,
  },
  breakdownTitle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onBackground },
  breakdownCount: { ...typography.labelXl, fontSize: 14, color: colors.onSurfaceVariant },
  list: {
    paddingHorizontal: spacing.containerMargin,
    paddingTop: spacing.stackMd,
    paddingBottom: spacing.stackLg,
    gap: spacing.stackSm,
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.stackMd,
    gap: spacing.stackSm,
    borderWidth: 1,
  },
  cardWon: { borderColor: colors.surfaceVariant },
  cardLost: { borderColor: colors.errorContainer },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.stackSm },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.stackSm, flexShrink: 1 },
  roundBadge: {
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  roundBadgeText: {
    ...typography.bodyMd,
    fontFamily: 'Rubik_700Bold',
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTarget: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onBackground, flexShrink: 1 },
  cardTargetLost: { color: colors.onSurfaceVariant, textDecorationLine: 'line-through', opacity: 0.7 },
  outcomeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.stackSm, paddingVertical: 4, borderRadius: radius.full },
  outcomeBadgeWon: { backgroundColor: colors.tertiaryContainer },
  outcomeBadgeLost: { backgroundColor: colors.errorContainer },
  outcomeBadgeText: { ...typography.labelXl, fontFamily: 'Rubik_700Bold', fontSize: 12 },
  outcomeTextWon: { color: colors.onTertiaryContainer },
  outcomeTextLost: { color: colors.onErrorContainer },
  cardInfoRow: { flexDirection: 'row', gap: spacing.stackSm },
  infoTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.sm,
    padding: spacing.stackSm,
    borderWidth: 1,
    borderColor: colors.surfaceDim,
  },
  avatar: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Rubik_700Bold', fontSize: 13, color: '#fff' },
  infoLabel: { ...typography.bodyMd, fontFamily: 'Rubik_700Bold', fontSize: 10, color: colors.onSurfaceVariant, letterSpacing: 0.5 },
  infoValue: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  footer: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackMd,
    paddingTop: spacing.stackSm,
    gap: spacing.stackSm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  playAgainBtn: {
    width: '100%',
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.card,
    shadowColor: colors.primary,
  },
  playAgainText: { ...typography.labelXl, fontFamily: 'Rubik_700Bold', color: colors.onPrimary },
  homeBtn: {
    width: '100%',
    height: 56,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeText: { ...typography.labelXl, color: colors.onSurface },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
