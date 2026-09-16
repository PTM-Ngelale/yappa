import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TypingIndicator } from '../components/TypingIndicator';
import { WordChain } from '../components/WordChain';
import { colors, elevation, radius, spacing, typography } from '../theme';

const AUTO_ADVANCE_SECONDS = 5;

interface RoundResolutionScreenProps {
  round: number;
  maxRounds: number;
  outcome: 'won' | 'lost-guess' | 'lost-timeout';
  targetWord: string;
  chain: string[];
  /** AI link-validation results keyed by chain index — advisory only, never affects score. */
  linkChecks?: Record<number, 'valid' | 'invalid'>;
  /** Rounds won so far, including this one. */
  scoreSoFar: number;
  isHost: boolean;
  onNextRound: () => void;
}

export function RoundResolutionScreen({
  round,
  maxRounds,
  outcome,
  targetWord,
  chain,
  linkChecks,
  scoreSoFar,
  isHost,
  onNextRound,
}: RoundResolutionScreenProps) {
  const won = outcome === 'won';
  const lostReason = outcome === 'lost-timeout' ? "Time's Up" : 'Wrong Guess';
  const [manualFlags, setManualFlags] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(AUTO_ADVANCE_SECONDS);
  const advancedRef = useRef(false);

  // Host: auto-advance after a few seconds so a stalled room never blocks.
  useEffect(() => {
    if (!isHost) return;
    advancedRef.current = false;
    setSecondsLeft(AUTO_ADVANCE_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!advancedRef.current) {
            advancedRef.current = true;
            onNextRound();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // Re-arm only when the round we're resolving changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round]);

  const handleNextPress = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onNextRound();
  };

  // Chain + revealed target, as one visual sequence.
  const fullChain = [...chain, targetWord];
  const hasAiFlaggedLink = Object.values(linkChecks ?? {}).some((status) => status === 'invalid');

  const toggleFlag = (index: number) => {
    setManualFlags((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Round {round} of {maxRounds}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.resultSection}>
          <View style={[styles.outcomePill, won ? styles.outcomePillWon : styles.outcomePillLost]}>
            <Text style={[styles.outcomeText, won ? styles.outcomeTextWon : styles.outcomeTextLost]}>
              {won ? 'Team Won!' : lostReason}
            </Text>
          </View>

          <Text style={styles.targetLabel}>Target Word</Text>
          <Text style={styles.targetWord}>{targetWord}</Text>

          <View style={styles.scorePill}>
            <Text style={styles.scoreText}>
              {scoreSoFar} of {round} round{round === 1 ? '' : 's'} won so far
            </Text>
          </View>
        </View>

        <View style={[styles.chainCard, elevation.card]}>
          <Text style={styles.chainTitle}>How you got there</Text>
          <WordChain
            words={fullChain}
            emphasiseLast={false}
            linkStatus={linkChecks}
            flaggedIndices={manualFlags}
            onLinkPress={toggleFlag}
          />
          <Text style={styles.aiFlagLegend}>
            {manualFlags.size > 0
              ? `Thanks — ${manualFlags.size} link${manualFlags.size === 1 ? '' : 's'} flagged for review`
              : hasAiFlaggedLink
                ? '⚠ marks a link our AI isn\'t sure chains — tap any link to flag it yourself'
                : 'Tap a link above to flag it as a bad chain'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        {isHost ? (
          <Pressable
            onPress={handleNextPress}
            accessibilityRole="button"
            accessibilityLabel="Next round"
            style={({ pressed }) => pressed && styles.btnPressed}
          >
            <View style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>
                {round >= maxRounds ? 'See Results' : `Next Round (${secondsLeft})`}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.waitingRow}>
            <TypingIndicator />
            <Text style={styles.waitingText}>Waiting for host to continue…</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.containerMargin,
    height: 64,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.headlineLgMobile, color: colors.primary },
  body: {
    flex: 1,
    padding: spacing.containerMargin,
    gap: spacing.stackLg,
  },
  resultSection: { alignItems: 'center', gap: spacing.stackSm },
  outcomePill: {
    paddingHorizontal: spacing.stackLg,
    paddingVertical: spacing.stackSm,
    borderRadius: radius.full,
    marginBottom: spacing.stackSm,
  },
  outcomePillWon: { backgroundColor: colors.tertiaryContainer },
  outcomePillLost: { backgroundColor: colors.errorContainer },
  outcomeText: { ...typography.labelXl, textTransform: 'uppercase', letterSpacing: 1 },
  outcomeTextWon: { color: colors.onTertiaryContainer },
  outcomeTextLost: { color: colors.onErrorContainer },
  targetLabel: { ...typography.bodyLg, color: colors.onSurfaceVariant },
  targetWord: {
    ...typography.displayLg,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 4,
    textAlign: 'center',
  },
  scorePill: {
    marginTop: spacing.stackSm,
    backgroundColor: colors.surfaceVariant,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  scoreText: { ...typography.bodyMd, color: colors.onSurface },
  chainCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    padding: spacing.stackMd,
    gap: spacing.stackSm,
  },
  chainTitle: {
    ...typography.labelXl,
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  aiFlagLegend: {
    ...typography.bodyMd,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackMd,
    paddingTop: spacing.stackSm,
    backgroundColor: colors.background,
  },
  nextBtn: {
    width: '100%',
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.card,
    shadowColor: colors.primary,
  },
  nextBtnText: {
    ...typography.labelXl,
    fontFamily: 'Rubik_700Bold',
    color: colors.onPrimary,
  },
  waitingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.stackSm,
    height: 64,
  },
  waitingText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
