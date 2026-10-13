import { Feather } from "@expo/vector-icons";
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
import { GameHeader } from "../components/game";
import { Pressable } from "../components/Pressable";
import { TypingIndicator } from "../components/TypingIndicator";
import { Eyebrow, OUTLINE, Screen, ScreenBody, Sticker, StickerButton, useShortScreen } from "../components/ui";
import { WordChain } from "../components/WordChain";
import { useShakeAnimation } from "../hooks/useShakeAnimation";
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from "../theme";

interface GuesserScreenProps {
  round: number;
  maxRounds: number;
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
   * Resolves to the verdict (judged server-side, may involve an AI check), or null if the
   * round ended before the guess landed; rejects if it couldn't be submitted, so the
   * Guesser can retry.
   */
  onGuess: (guess: string) => Promise<boolean | null>;
}

export function GuesserScreen({
  round,
  maxRounds,
  category,
  chain,
  activeKnowerName,
  knowerIsTyping,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
  onGuess,
}: GuesserScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const [guessInputVisible, setGuessInputVisible] = useState(false);
  const [guess, setGuess] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const { shakeAnim, shake } = useShakeAnimation();

  const handleSubmitGuess = async () => {
    const trimmed = guess.trim();
    if (trimmed.length === 0 || checking) return;
    setChecking(true);
    let correct: boolean | null = false;
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
    // Too late — time ran out first. The screen is about to switch to the round result.
    if (correct === null) return;
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
  const canSubmit = guess.trim().length > 0 && !checking;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScreenBody style={styles.body}>
          <GameHeader
            round={round}
            maxRounds={maxRounds}
            role="You’re guessing"
            roleBg={p.coral}
            roleFg={p.onCoral}
            durationSeconds={durationSeconds}
            secondsRemaining={secondsRemaining}
            showTimer={showTimer}
          />

          {/* Category — the only hint the Guesser gets */}
          <View style={styles.categoryBlock}>
            {!short && <Eyebrow>The category is</Eyebrow>}
            <Text style={[styles.category, short && styles.categoryCompact]} adjustsFontSizeToFit numberOfLines={1}>
              {category}
            </Text>
          </View>

          <Sticker style={[styles.chainWrap, short && styles.chainWrapCompact]} radius={26} offset={6} contentStyle={styles.chainCard}>
            {isPreFirstWord ? (
              <View style={styles.preWord}>
                <Text style={styles.preWordTitle}>Your friends are thinking…</Text>
                <Text style={styles.preWordSub}>{activeKnowerName} is up first</Text>
              </View>
            ) : (
              // A short screen has room for the newest word and the one before it.
              <WordChain words={short ? chain.slice(-2) : chain} variant="center" style={styles.flex} />
            )}
            <View style={styles.typingRow} accessibilityLiveRegion="polite">
              <TypingIndicator active={knowerIsTyping} />
              <Text style={styles.typingText}>
                {knowerIsTyping
                  ? `${activeKnowerName} is typing`
                  : `${activeKnowerName} is thinking`}
              </Text>
            </View>
          </Sticker>
        </ScreenBody>

        <View style={styles.footer}>
          {errorMsg !== "" && (
            <Text style={styles.errorMsg} accessibilityLiveRegion="assertive">
              {errorMsg}
            </Text>
          )}

          {guessInputVisible ? (
            <>
              <Animated.View
                style={[styles.guessRow, { transform: [{ translateX: shakeAnim }] }]}
              >
                <TextInput
                  style={styles.guessInput}
                  value={guess}
                  onChangeText={(t) => {
                    setGuess(t);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder="What's the secret word?"
                  placeholderTextColor={p.muted}
                  autoFocus
                  editable={!checking}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitGuess}
                  accessibilityLabel="Your guess"
                />
                <Pressable
                  onPress={handleSubmitGuess}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={checking ? "Checking guess" : "Submit guess"}
                  accessibilityState={{ busy: checking, disabled: !canSubmit }}
                  style={[styles.submit, !canSubmit && !checking && styles.submitDisabled]}
                >
                  {checking ? (
                    <ActivityIndicator color={p.onCoral} />
                  ) : (
                    <Feather name="check" size={28} color={canSubmit ? p.onCoral : p.onDisabled} />
                  )}
                </Pressable>
              </Animated.View>
              {checking ? (
                <Text style={styles.cancelText} accessibilityLiveRegion="polite">
                  Checking your guess…
                </Text>
              ) : (
                <Pressable
                  onPress={() => {
                    setGuessInputVisible(false);
                    setGuess("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel guess"
                  style={styles.cancel}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <StickerButton
                label="I know it!"
                icon="help-circle"
                height={short ? 60 : 72}
                fontSize={short ? 24 : 28}
                onPress={() => setGuessInputVisible(true)}
                accessibilityLabel="Make a guess"
              />
              {!short && <Text style={styles.footnote}>One guess. A wrong answer ends the round.</Text>}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    body: { paddingHorizontal: spacing.screen, paddingTop: 10, gap: 14 },
    categoryBlock: { alignItems: "center", gap: 2 },
    category: { fontFamily: fonts.black, fontSize: 50, lineHeight: 56, letterSpacing: -1.5, color: p.ink },
    categoryCompact: { fontSize: 36, lineHeight: 42 },
    // Room for the newest word, the one before it and the typing line.
    chainWrap: { flex: 1, minHeight: 190 },
    chainWrapCompact: { minHeight: 140 },
    chainCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
    preWord: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
    preWordTitle: { fontFamily: fonts.black, fontSize: 24, color: p.ink, textAlign: "center" },
    preWordSub: { ...type.body, color: p.muted },
    typingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 8 },
    typingText: { fontFamily: fonts.bold, fontSize: 16, color: p.ink },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 14, gap: 8 },
    footnote: { ...type.small, color: p.ink, textAlign: "center" },
    errorMsg: { ...type.bodyBold, color: p.danger, textAlign: "center" },
    guessRow: { flexDirection: "row", gap: 10 },
    guessInput: {
      flex: 1,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.card,
      paddingHorizontal: 18,
      fontFamily: fonts.bold,
      fontSize: 20,
      color: p.ink,
    },
    submit: {
      width: 60,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.coral,
      alignItems: "center",
      justifyContent: "center",
    },
    submitDisabled: { backgroundColor: p.disabled },
    cancel: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16 },
    cancelText: { fontFamily: fonts.bold, fontSize: 17, color: p.ink, textAlign: "center" },
  });
