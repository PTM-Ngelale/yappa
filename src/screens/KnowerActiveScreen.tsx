import React, { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoleChip } from '../components/RoleChip';
import { TimerBar } from '../components/TimerBar';
import { WordChain } from '../components/WordChain';
import { useShakeAnimation } from '../hooks/useShakeAnimation';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface KnowerActiveScreenProps {
  round: number;
  targetWord: string;
  category: string;
  chain: string[];
  durationSeconds: number;
  secondsRemaining: number;
  /** Hide the timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
  onSubmitWord: (word: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

/** Returns true if the candidate matches the target or an obvious variant */
function matchesTarget(candidate: string, target: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const c = norm(candidate);
  const t = norm(target);
  if (c === t) return true;
  // Plurals and common inflections
  const variants = [
    t + 's',
    t + 'es',
    t + 'ing',
    t + 'ed',
    t + 'er',
    t + 'ers',
    t.replace(/e$/, 'ing'),  // dance → dancing
    t.replace(/e$/, 'ed'),   // dance → danced
    t.replace(/y$/, 'ies'),  // berry → berries
    t.replace(/y$/, 'ied'),  // carry → carried
  ];
  return variants.includes(c);
}

export function KnowerActiveScreen({
  round,
  targetWord,
  category,
  chain,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
  onSubmitWord,
  onTypingChange,
}: KnowerActiveScreenProps) {
  const [word, setWord] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const { shakeAnim, shake } = useShakeAnimation();
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = word.trim();
    if (trimmed.length === 0) return;

    if (matchesTarget(trimmed, targetWord)) {
      shake();
      setValidationMsg("That's the target — try a different word.");
      setTimeout(() => setValidationMsg(''), 3000);
      return;
    }

    setValidationMsg('');
    onTypingChange?.(false);
    onSubmitWord(trimmed);
    setWord('');
  };

  // Spacebar submits — detect trailing space with content before it
  const handleChangeText = (text: string) => {
    if (text.endsWith(' ') && text.trim().length > 0) {
      setWord(text.trimEnd());
      handleSendRef.current();
      return;
    }
    setWord(text);
    if (validationMsg) setValidationMsg('');
    onTypingChange?.(text.trim().length > 0);
  };

  // Ref trick so handleSend closure inside handleChangeText sees latest state
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const canSend = word.trim().length > 0;

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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <RoleChip role="knower" isYourTurn />

          {/* Target word — pinned at top, always visible */}
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
            showPending
            style={styles.chainCard}
            emptyState={
              <Text style={styles.chainEmptyText}>You go first — add the opening word</Text>
            }
          />
        </ScrollView>

        {/* Input row */}
        <View style={styles.inputSection}>
          {validationMsg !== '' && (
            <Text style={styles.validationMsg} accessibilityLiveRegion="assertive">
              {validationMsg}
            </Text>
          )}
          <Animated.View
            style={[styles.inputRow, { transform: [{ translateX: shakeAnim }] }]}
          >
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={word}
              onChangeText={handleChangeText}
              placeholder="Type your word…"
              placeholderTextColor={colors.onSurfaceVariant}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              accessibilityLabel="Type your word"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && styles.sendBtnPressed,
                !canSend && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send word"
            >
              <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextDisabled]}>
                Send →
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
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
  scroll: {
    padding: spacing.containerMargin,
    paddingBottom: spacing.stackLg,
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
    ...elevation.card,
    shadowColor: colors.primaryContainer,
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
  inputSection: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackMd,
    paddingTop: spacing.stackSm,
    gap: spacing.stackSm,
    backgroundColor: colors.background,
  },
  validationMsg: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.stackMd,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 56,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.full,
    paddingHorizontal: spacing.stackMd,
    ...typography.bodyLg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  sendBtn: {
    height: 64,
    paddingHorizontal: spacing.stackMd,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.card,
  },
  sendBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  sendBtnDisabled: { backgroundColor: colors.surfaceContainerHigh },
  sendBtnText: { ...typography.labelXl, fontFamily: 'Rubik_700Bold', color: colors.onPrimaryContainer },
  sendBtnTextDisabled: { color: colors.onSurfaceVariant },
});
