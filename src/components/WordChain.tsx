import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Pressable } from './Pressable';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface WordChainProps {
  words: string[];
  /** Show "link to this" emphasis on the last word (Knower screens only) */
  emphasiseLast?: boolean;
  /** Show → placeholder for the next incoming word */
  showPending?: boolean;
  /** Content shown in place of the chain when `words` is empty (e.g. "You go first…") */
  emptyState?: React.ReactNode;
  /**
   * AI link-validation results keyed by word index (see checkLink()) — index i marks the
   * link between words[i-1] and words[i]. Advisory only; only 'invalid' renders a badge.
   */
  linkStatus?: Record<number, 'valid' | 'invalid'>;
  /** Manually-flagged link indices (e.g. a player tapping a link on Round Resolution). */
  flaggedIndices?: Set<number>;
  /** When provided, each link connector becomes tappable — index i is the link before words[i]. */
  onLinkPress?: (index: number) => void;
  /** Overrides for the outer card (e.g. `flex: 1` on the Guesser screen) */
  style?: StyleProp<ViewStyle>;
}

/** The card that holds the growing word chain — pills linked by connector nodes. */
export function WordChain({
  words,
  emphasiseLast = false,
  showPending = false,
  emptyState,
  linkStatus,
  flaggedIndices,
  onLinkPress,
  style,
}: WordChainProps) {
  const isEmpty = words.length === 0;

  return (
    <View style={[styles.card, elevation.card, style]}>
      <Text style={styles.eyebrow}>THE CHAIN</Text>

      {isEmpty ? (
        <View style={styles.emptyWrap}>{emptyState}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          accessibilityLabel={`Word chain: ${words.join(', ')}`}
        >
          {words.map((word, i) => {
            const isLast = i === words.length - 1;
            const emphasise = emphasiseLast && isLast;

            const flagged = linkStatus?.[i] === 'invalid' || flaggedIndices?.has(i);

            return (
              <View key={i} style={styles.linkGroup}>
                {i > 0 && (
                  onLinkPress ? (
                    <Pressable
                      onPress={() => onLinkPress(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Flag the link before "${word}"`}
                      hitSlop={8}
                    >
                      <ChainLink flagged={flagged} />
                    </Pressable>
                  ) : (
                    <ChainLink flagged={flagged} />
                  )
                )}

                <View style={[styles.wordPill, emphasise && styles.wordPillActive]}>
                  <Text style={[styles.wordText, emphasise && styles.wordTextActive]}>
                    {word}
                  </Text>
                  {emphasise && <Text style={styles.linkLabel}>link to this</Text>}
                </View>
              </View>
            );
          })}

          {showPending && (
            <View style={styles.linkGroup}>
              <ChainLink pending />
              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>⋯</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** A small circular node between pills — echoes the game's compound-word chain-link motif. */
function ChainLink({ pending = false, flagged = false }: { pending?: boolean; flagged?: boolean }) {
  return (
    <View style={[styles.chainLink, pending && styles.chainLinkPending]}>
      <Text style={[styles.chainLinkText, pending && styles.chainLinkTextPending]}>→</Text>
      {flagged && (
        <View style={styles.flagBadge} accessibilityLabel="This link was flagged">
          <Text style={styles.flagBadgeText}>!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  eyebrow: {
    ...typography.labelXl,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
    opacity: 0.7,
    paddingHorizontal: spacing.stackLg,
    paddingTop: spacing.stackMd,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.stackLg,
  },
  row: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.stackLg,
    paddingTop: spacing.stackSm,
    paddingBottom: spacing.stackLg,
  },
  linkGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chainLink: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    marginHorizontal: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  flagBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flagBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onError,
    lineHeight: 12,
  },
  chainLinkPending: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  chainLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  chainLinkTextPending: {
    color: colors.onSurfaceVariant,
    opacity: 0.5,
  },
  wordPill: {
    alignItems: 'center',
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: 2,
  },
  wordPillActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
    borderWidth: 2,
    // Slightly larger — achieved via padding, not scale, to keep layout stable
    paddingHorizontal: spacing.stackMd + 4,
    paddingVertical: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 2,
  },
  wordText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    lineHeight: 22,
    color: colors.onSurface,
    letterSpacing: 0.2,
    textTransform: 'capitalize',
  },
  wordTextActive: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 21,
    lineHeight: 25,
    color: colors.onPrimaryContainer,
    letterSpacing: 0.2,
    textTransform: 'capitalize',
  },
  linkLabel: {
    ...typography.bodyMd,
    fontSize: 11,
    color: colors.onPrimaryContainer,
    opacity: 0.8,
    letterSpacing: 0.3,
  },
  pendingPill: {
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
  },
  pendingText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 18,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    opacity: 0.4,
  },
});
