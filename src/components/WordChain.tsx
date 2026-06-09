import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface WordChainProps {
  words: string[];
  /** Show "link to this" emphasis on the last word (Knower screens only) */
  emphasiseLast?: boolean;
  /** Show → placeholder for the next incoming word */
  showPending?: boolean;
}

export function WordChain({ words, emphasiseLast = false, showPending = false }: WordChainProps) {
  if (words.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={`Word chain: ${words.join(', ')}`}
    >
      {words.map((word, i) => {
        const isLast = i === words.length - 1;
        const emphasise = emphasiseLast && isLast;

        return (
          <View key={i} style={styles.linkGroup}>
            {/* Arrow connector (not before first word) */}
            {i > 0 && (
              <Text style={styles.arrow} accessibilityElementsHidden>→</Text>
            )}

            <View style={[styles.wordPill, emphasise && styles.wordPillActive]}>
              <Text style={[styles.wordText, emphasise && styles.wordTextActive]}>
                {word}
              </Text>
              {emphasise && (
                <Text style={styles.linkLabel}>link to this</Text>
              )}
            </View>
          </View>
        );
      })}

      {/* Pending slot — shows the "..." waiting indicator */}
      {showPending && (
        <View style={styles.linkGroup}>
          <Text style={styles.arrow} accessibilityElementsHidden>→</Text>
          <View style={styles.pendingPill}>
            <Text style={styles.pendingText}>…</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.stackSm,
    paddingVertical: spacing.stackMd,
    gap: 0,
  },
  linkGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  arrow: {
    ...typography.headlineLgMobile,
    color: colors.outline,
    marginHorizontal: spacing.stackSm,
    lineHeight: 36,
  },
  wordPill: {
    alignItems: 'center',
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
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
    paddingVertical: spacing.stackSm + 2,
  },
  wordText: {
    ...typography.headlineLgMobile,
    color: colors.onSurface,
  },
  wordTextActive: {
    ...typography.headlineLg,
    color: colors.onPrimaryContainer,
    fontWeight: '700',
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
    paddingVertical: spacing.stackSm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
  },
  pendingText: {
    ...typography.headlineLgMobile,
    color: colors.onSurfaceVariant,
    opacity: 0.5,
  },
});
