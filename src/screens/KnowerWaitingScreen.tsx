import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoleChip } from '../components/RoleChip';
import { TimerBar } from '../components/TimerBar';
import { TypingIndicator } from '../components/TypingIndicator';
import { WordChain } from '../components/WordChain';
import { colors, radius, spacing, typography } from '../theme';

interface KnowerWaitingScreenProps {
  round: number;
  targetWord: string;
  category: string;
  chain: string[];
  partnerName: string;
  /** True while partner is actively typing (after their turn starts) */
  partnerIsTyping: boolean;
  durationSeconds: number;
  secondsRemaining: number;
  /** Hide the timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
}

export function KnowerWaitingScreen({
  round,
  targetWord,
  category,
  chain,
  partnerName,
  partnerIsTyping,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
}: KnowerWaitingScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      {showTimer && (
        <TimerBar durationSeconds={durationSeconds} secondsRemaining={secondsRemaining} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconBtn} />
        <Text style={styles.headerTitle}>Round {round}</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.body}>
        <RoleChip role="knower" isYourTurn={false} />

        {/* Target word — same position as active screen */}
        <View style={styles.targetSection}>
          <Text style={styles.targetLabel}>SECRET WORD</Text>
          <View style={styles.targetCard}>
            <Text style={styles.targetWord}>{targetWord}</Text>
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>Category: {category}</Text>
          </View>
        </View>

        {/* Chain canvas */}
        <WordChain
          words={chain}
          emphasiseLast
          showPending={partnerIsTyping}
          style={styles.chainCard}
          emptyState={
            <Text style={styles.chainEmptyText}>Waiting for {partnerName} to start…</Text>
          }
        />

        {/* Partner status */}
        <View style={styles.partnerRow}>
          <TypingIndicator active={partnerIsTyping} />
          <Text style={styles.partnerText}>
            {partnerIsTyping ? `${partnerName} is typing…` : `${partnerName} is thinking…`}
          </Text>
        </View>

        {/* Locked input — visually identical position to active screen but disabled */}
        <View style={styles.inputSection}>
          <View style={styles.inputRow}>
            <TextInput
              editable={false}
              placeholder="Waiting for your turn…"
              placeholderTextColor={colors.onSurfaceVariant}
              style={styles.input}
              accessibilityLabel="Input locked — waiting for partner"
              accessibilityState={{ disabled: true }}
            />
            <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
              <Text style={styles.sendBtnTextDisabled}>Send →</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
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
  // Empty spacer matching the old icon button's footprint, so the title stays centered.
  iconBtn: { width: 40, height: 40 },
  body: {
    flex: 1,
    padding: spacing.containerMargin,
    gap: spacing.stackLg,
  },
  targetSection: { alignItems: 'center', gap: spacing.stackMd },
  targetLabel: {
    ...typography.labelXl,
    color: colors.onSurfaceVariant,
    letterSpacing: 2,
  },
  targetCard: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: spacing.stackLg,
    paddingVertical: spacing.stackMd,
    borderRadius: radius.xl,
    opacity: 0.75,
  },
  targetWord: {
    ...typography.displayLg,
    color: colors.onPrimaryContainer,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  categoryText: { ...typography.bodyMd, color: colors.onSurface },
  chainCard: {
    minHeight: 140,
  },
  chainEmptyText: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    padding: spacing.stackLg,
    textAlign: 'center',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.stackSm,
  },
  partnerText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  inputSection: {
    marginTop: 'auto',
    gap: spacing.stackSm,
    opacity: 0.45,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.stackMd,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.full,
    paddingHorizontal: spacing.stackMd,
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
    borderWidth: 1,
    borderColor: colors.surfaceDim,
  },
  sendBtn: {
    height: 64,
    paddingHorizontal: spacing.stackMd,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.surfaceContainerHigh },
  sendBtnTextDisabled: { ...typography.labelXl, color: colors.onSurfaceVariant },
});
