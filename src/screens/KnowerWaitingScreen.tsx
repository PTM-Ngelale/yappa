import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoleChip } from '../components/RoleChip';
import { TimerBar } from '../components/TimerBar';
import { TypingIndicator } from '../components/TypingIndicator';
import { WordChain } from '../components/WordChain';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface KnowerWaitingScreenProps {
  targetWord: string;
  category: string;
  chain: string[];
  partnerName: string;
  /** True while partner is actively typing (after their turn starts) */
  partnerIsTyping: boolean;
  durationSeconds: number;
  secondsRemaining: number;
}

export function KnowerWaitingScreen({
  targetWord,
  category,
  chain,
  partnerName,
  partnerIsTyping,
  durationSeconds,
  secondsRemaining,
}: KnowerWaitingScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <TimerBar durationSeconds={durationSeconds} secondsRemaining={secondsRemaining} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} accessibilityLabel="Game info" accessibilityRole="button">
          <Text style={styles.iconText}>ℹ</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Round 1: Role</Text>
        <Pressable style={styles.iconBtn} accessibilityLabel="Settings" accessibilityRole="button">
          <Text style={styles.iconText}>⚙</Text>
        </Pressable>
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
        <View style={[styles.chainCard, elevation.card]}>
          {chain.length === 0 ? (
            <Text style={styles.chainEmptyText}>Waiting for {partnerName} to start…</Text>
          ) : (
            <WordChain
              words={chain}
              emphasiseLast
              showPending={partnerIsTyping}
            />
          )}
        </View>

        {/* Partner status */}
        <View style={styles.partnerRow}>
          <TypingIndicator />
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
  iconBtn: { padding: spacing.stackSm, borderRadius: radius.full },
  iconText: { fontSize: 20, color: colors.onSurfaceVariant },
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
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
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
