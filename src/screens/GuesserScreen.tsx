import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TimerBar } from '../components/TimerBar';
import { TypingIndicator } from '../components/TypingIndicator';
import { WordChain } from '../components/WordChain';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface GuesserScreenProps {
  category: string;
  chain: string[];
  activeKnowerName: string;
  /** True while the active Knower is typing (after their turn starts, before they submit) */
  knowerIsTyping: boolean;
  durationSeconds: number;
  secondsRemaining: number;
  onGuess: (guess: string) => void;
}

export function GuesserScreen({
  category,
  chain,
  activeKnowerName,
  knowerIsTyping,
  durationSeconds,
  secondsRemaining,
  onGuess,
}: GuesserScreenProps) {
  const [guessInputVisible, setGuessInputVisible] = useState(false);
  const [guess, setGuess] = useState('');

  const handleSubmitGuess = () => {
    const trimmed = guess.trim();
    if (trimmed.length === 0) return;
    onGuess(trimmed);
    setGuess('');
    setGuessInputVisible(false);
  };

  const isPreFirstWord = chain.length === 0;

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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.body}>
          {/* Category pill — only hint the Guesser gets */}
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>

          {/* Chain canvas */}
          <View style={[styles.chainCard, elevation.card]}>
            {isPreFirstWord ? (
              /* Pre-first-word state */
              <View style={styles.preFistWordState}>
                <Text style={styles.preWordText}>Your friends are thinking…</Text>
                <View style={styles.knowerBadge}>
                  <Text style={styles.knowerBadgeText}>{activeKnowerName} is up first</Text>
                </View>
              </View>
            ) : (
              <WordChain
                words={chain}
                emphasiseLast={false}
                showPending={knowerIsTyping}
              />
            )}
          </View>

          {/* Typing indicator — shown between words once chain has started */}
          {!isPreFirstWord && (
            <View style={styles.typingRow}>
              <TypingIndicator />
              <Text style={styles.typingText}>
                {knowerIsTyping
                  ? `${activeKnowerName} is typing…`
                  : `${activeKnowerName} is thinking…`}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom — guess input area */}
        <View style={styles.footer}>
          {guessInputVisible && (
            <View style={styles.guessInputRow}>
              <TextInput
                style={styles.guessInput}
                value={guess}
                onChangeText={setGuess}
                placeholder="What's the target word?"
                placeholderTextColor={colors.onSurfaceVariant}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmitGuess}
                accessibilityLabel="Type your guess"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.submitGuessBtn,
                  pressed && styles.btnPressed,
                  guess.trim().length === 0 && styles.btnDisabled,
                ]}
                onPress={handleSubmitGuess}
                disabled={guess.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Submit guess"
              >
                <Text style={styles.submitGuessBtnText}>✓</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.guessButtonRow}>
            {guessInputVisible ? (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => { setGuessInputVisible(false); setGuess(''); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel guess"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.guessBtn, pressed && styles.btnPressed]}
                onPress={() => setGuessInputVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Lock in a guess"
              >
                <Text style={styles.guessBtnText}>Guess!</Text>
              </Pressable>
            )}
          </View>
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
  iconBtn: { padding: spacing.stackSm, borderRadius: radius.full },
  iconText: { fontSize: 20, color: colors.onSurfaceVariant },
  body: {
    flex: 1,
    padding: spacing.containerMargin,
    gap: spacing.stackLg,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  categoryText: { ...typography.labelXl, color: colors.onSurfaceVariant },
  chainCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  preFistWordState: {
    alignItems: 'center',
    gap: spacing.stackMd,
    padding: spacing.stackLg,
  },
  preWordText: {
    ...typography.headlineLgMobile,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  knowerBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    borderRadius: radius.full,
  },
  knowerBadgeText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.stackSm,
  },
  typingText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  footer: {
    paddingHorizontal: spacing.containerMargin,
    paddingBottom: spacing.stackMd,
    paddingTop: spacing.stackSm,
    gap: spacing.stackSm,
    backgroundColor: colors.background,
  },
  guessInputRow: {
    flexDirection: 'row',
    gap: spacing.stackSm,
    alignItems: 'center',
  },
  guessInput: {
    flex: 1,
    height: 56,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.full,
    paddingHorizontal: spacing.stackMd,
    ...typography.bodyLg,
    color: colors.onSurface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  submitGuessBtn: {
    width: 56,
    height: 56,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitGuessBtnText: {
    ...typography.headlineLgMobile,
    color: colors.onPrimary,
    fontWeight: '700',
  },
  guessButtonRow: {},
  guessBtn: {
    width: '100%',
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    ...elevation.card,
    shadowColor: colors.primary,
  },
  guessBtnText: {
    ...typography.headlineLgMobile,
    color: colors.onPrimary,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { ...typography.labelXl, color: colors.onSurfaceVariant },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btnDisabled: { backgroundColor: colors.surfaceContainerHigh },
});
