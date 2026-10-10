import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "../components/Pressable";
import { SafeAreaView } from "react-native-safe-area-context";
import { TimerBar } from "../components/TimerBar";
import { TypingIndicator } from "../components/TypingIndicator";
import { WordChain } from "../components/WordChain";
import { useShakeAnimation } from "../hooks/useShakeAnimation";
import { colors, elevation, radius, spacing, typography } from "../theme";

interface GuesserScreenProps {
  round: number;
  category: string;
  chain: string[];
  activeKnowerName: string;
  /** True while the active Knower is typing (after their turn starts, before they submit) */
  knowerIsTyping: boolean;
  durationSeconds: number;
  secondsRemaining: number;
  /** Hide the timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
  /**
   * Resolves to whether the guess was correct (judged server-side, may involve an AI check);
   * rejects if the guess couldn't be submitted, in which case the Guesser can retry.
   */
  onGuess: (guess: string) => Promise<boolean>;
}

export function GuesserScreen({
  round,
  category,
  chain,
  activeKnowerName,
  knowerIsTyping,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
  onGuess,
}: GuesserScreenProps) {
  const [guessInputVisible, setGuessInputVisible] = useState(false);
  const [guess, setGuess] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const { shakeAnim, shake } = useShakeAnimation();

  const handleSubmitGuess = async () => {
    const trimmed = guess.trim();
    if (trimmed.length === 0 || checking) return;
    setChecking(true);
    let correct = false;
    try {
      correct = await onGuess(trimmed);
    } catch (e) {
      // Never reached the judge — keep the guess so they can resend it.
      console.error(e);
      setErrorMsg("Couldn't send your guess — check your connection and try again.");
      return;
    } finally {
      setChecking(false);
    }
    if (correct) {
      setGuess("");
      setGuessInputVisible(false);
    } else {
      shake();
      setErrorMsg("Not quite — that's not the word.");
      // Safety net in case the round doesn't resolve promptly for some reason.
      setTimeout(() => setErrorMsg(""), 3000);
    }
  };

  const isPreFirstWord = chain.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      {showTimer && (
        <TimerBar
          durationSeconds={durationSeconds}
          secondsRemaining={secondsRemaining}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconBtn} />
        <Text style={styles.headerTitle}>Round {round}</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.body}>
          {/* Category pill — only hint the Guesser gets */}
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category}</Text>
          </View>

          {/* Chain canvas */}
          <WordChain
            words={chain}
            emphasiseLast={false}
            showPending={knowerIsTyping}
            style={styles.chainCard}
            emptyState={
              <View style={styles.preFistWordState}>
                <Text style={styles.preWordText}>
                  Your friends are thinking…
                </Text>
                <View style={styles.knowerBadge}>
                  <Text style={styles.knowerBadgeText}>
                    {activeKnowerName} is up first
                  </Text>
                </View>
              </View>
            }
          />

          {/* Typing indicator — shown between words once chain has started */}
          {!isPreFirstWord && (
            <View style={styles.typingRow}>
              <TypingIndicator active={knowerIsTyping} />
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
          {errorMsg !== "" && (
            <Text style={styles.errorMsg} accessibilityLiveRegion="assertive">
              {errorMsg}
            </Text>
          )}
          {guessInputVisible && (
            <Animated.View
              style={[
                styles.guessInputRow,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              <TextInput
                style={styles.guessInput}
                value={guess}
                onChangeText={(t) => {
                  setGuess(t);
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder="What's the target word?"
                placeholderTextColor={colors.onSurfaceVariant}
                autoFocus
                editable={!checking}
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
                disabled={guess.trim().length === 0 || checking}
                accessibilityRole="button"
                accessibilityLabel={checking ? "Checking guess" : "Submit guess"}
                accessibilityState={{ busy: checking }}
              >
                {checking ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Ionicons name="checkmark" size={28} color={colors.onPrimary} />
                )}
              </Pressable>
            </Animated.View>
          )}

          <View style={styles.guessButtonRow}>
            {checking ? (
              <View style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText} accessibilityLiveRegion="polite">
                  Checking your guess…
                </Text>
              </View>
            ) : guessInputVisible ? (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  setGuessInputVisible(false);
                  setGuess("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel guess"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.guessBtn,
                  pressed && styles.btnPressed,
                ]}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  categoryText: { ...typography.labelXl, color: colors.onSurfaceVariant },
  chainCard: {
    flex: 1,
  },
  preFistWordState: {
    alignItems: "center",
    gap: spacing.stackMd,
    padding: spacing.stackLg,
  },
  preWordText: {
    ...typography.headlineLgMobile,
    color: colors.onSurfaceVariant,
    textAlign: "center",
  },
  knowerBadge: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    borderRadius: radius.full,
  },
  knowerBadgeText: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
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
  errorMsg: {
    ...typography.bodyMd,
    color: colors.error,
    textAlign: "center",
  },
  guessInputRow: {
    flexDirection: "row",
    gap: spacing.stackSm,
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
    ...elevation.card,
    shadowColor: colors.primary,
  },
  guessButtonRow: {},
  guessBtn: {
    width: "100%",
    height: 64,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.onPrimaryContainer,
    // Neutral black shadow (not tinted to the button color) so the button still
    // reads as "lifted" off the page even under warm/night-mode display filters
    // that can wash out coral-on-cream contrast.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  guessBtnText: {
    ...typography.headlineLgMobile,
    fontFamily: "Rubik_700Bold",
    color: colors.onPrimary,
  },
  cancelBtn: {
    width: "100%",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelBtnText: { ...typography.labelXl, color: colors.onSurfaceVariant },
  btnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  btnDisabled: { backgroundColor: colors.surfaceContainerHigh },
});
