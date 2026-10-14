import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
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
import { categoryLabel } from "../game/categories";
import { DescriptionFeed } from "../components/DescriptionFeed";
import { GameHeader, TipCard } from "../components/game";
import { Pressable } from "../components/Pressable";
import { TypingIndicator } from "../components/TypingIndicator";
import { Eyebrow, OUTLINE, Screen, ScreenBody, Sticker, useShortScreen } from "../components/ui";
import { GUESS_COOLDOWN_SECONDS, ROUND_SECONDS } from "../game/config";
import { useShakeAnimation } from "../hooks/useShakeAnimation";
import type { FeedEntry } from "../supabase/room";
import type { GuessResult } from "../supabase/round";
import type { RoomPlayer } from "../store/gameStore";
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from "../theme";

interface GuesserScreenProps {
  round: number;
  maxRounds: number;
  category: string;
  feed: FeedEntry[];
  players: Record<string, RoomPlayer>;
  activeKnowerName: string;
  /** True while the active Knower is typing (after their turn starts, before they submit) */
  knowerIsTyping: boolean;
  /** The round's clock: get it before it runs out. */
  roundSeconds: number;
  /** Hide the round timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
  /** This round's first-game tip, if any. */
  tip?: { text: string; onDismiss: () => void };
  /** Judged server-side (may involve an AI check); rejects if it couldn't be sent, so they can retry. */
  onGuess: (guess: string) => Promise<GuessResult>;
}

export function GuesserScreen({
  round,
  maxRounds,
  category,
  feed,
  players,
  activeKnowerName,
  knowerIsTyping,
  roundSeconds,
  showTimer = true,
  tip,
  onGuess,
}: GuesserScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const label = categoryLabel(category);
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  // Guesses are 3 seconds apart: the button counts the wait down.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const { shakeAnim, shake } = useShakeAnimation();

  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const handleSubmitGuess = async () => {
    const trimmed = guess.trim();
    if (trimmed.length === 0 || checking || cooldown > 0) return;
    setChecking(true);
    setMessage("");
    setCooldownUntil(Date.now() + GUESS_COOLDOWN_SECONDS * 1000);
    setNow(Date.now());
    let result: GuessResult;
    try {
      result = await onGuess(trimmed);
    } catch (e) {
      // Never reached the judge: keep the guess so they can resend it.
      console.error(e);
      setCooldownUntil(0);
      setMessage("Couldn't send your guess. Check your connection and try again.");
      return;
    } finally {
      setChecking(false);
    }
    if (result.status === "wrong") {
      setGuess("");
      shake();
      setMessage("Not it! Keep guessing.");
    } else if (result.status === "cooldown") {
      setMessage("Hang on a second before guessing again.");
    }
    // 'correct' and 'closed': the screen is about to switch to the round result.
  };

  const canSubmit = guess.trim().length > 0 && !checking && cooldown === 0;
  const hasWords = feed.some((e) => e.kind === "word");

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScreenBody style={styles.body}>
          <GameHeader
            round={round}
            maxRounds={maxRounds}
            role="You’re guessing"
            roleBg={p.coral}
            roleFg={p.onCoral}
            durationSeconds={ROUND_SECONDS}
            secondsRemaining={roundSeconds}
            showTimer={showTimer}
            compact={short}
          />

          {/* Category: the only hint the Guesser gets besides the description */}
          <View style={styles.categoryBlock}>
            {!short && <Eyebrow>The category is</Eyebrow>}
            <Text
              style={[styles.category, short && styles.categoryCompact, label.length > 12 && (short ? styles.categoryLongCompact : styles.categoryLong)]}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
          {tip && !short && <TipCard text={tip.text} onDismiss={tip.onDismiss} />}

          <Sticker style={[styles.feedWrap, short && styles.feedWrapCompact]} radius={26} offset={6} contentStyle={styles.feedCard}>
            {hasWords || feed.length > 0 ? (
              <DescriptionFeed entries={feed} players={players} large style={styles.flex} />
            ) : (
              <View style={styles.preWord}>
                <Text style={styles.preWordTitle}>Your friends are thinking…</Text>
                <Text style={styles.preWordSub}>{activeKnowerName} is up first</Text>
              </View>
            )}
            <View style={styles.typingRow} accessibilityLiveRegion="polite">
              <TypingIndicator active={knowerIsTyping} />
              <Text style={styles.typingText}>
                {knowerIsTyping ? `${activeKnowerName} is typing` : `${activeKnowerName} is thinking`}
              </Text>
            </View>
          </Sticker>
        </ScreenBody>

        <View style={styles.footer}>
          {message !== "" && (
            <Text style={styles.message} accessibilityLiveRegion="assertive">
              {message}
            </Text>
          )}
          <Animated.View style={[styles.guessRow, { transform: [{ translateX: shakeAnim }] }]}>
            <TextInput
              style={styles.guessInput}
              value={guess}
              onChangeText={(t) => {
                setGuess(t);
                if (message) setMessage("");
              }}
              placeholder="What's the secret word?"
              placeholderTextColor={p.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSubmitGuess}
              blurOnSubmit={false}
              accessibilityLabel="Your guess"
            />
            <Pressable
              onPress={handleSubmitGuess}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel={checking ? "Checking guess" : cooldown > 0 ? `Guess again in ${cooldown} seconds` : "Submit guess"}
              accessibilityState={{ busy: checking, disabled: !canSubmit }}
              style={[styles.submit, !canSubmit && !checking && styles.submitDisabled]}
            >
              {checking ? (
                <ActivityIndicator color={p.onCoral} />
              ) : cooldown > 0 ? (
                <Text style={styles.cooldown}>{cooldown}s</Text>
              ) : (
                <Feather name="check" size={28} color={canSubmit ? p.onCoral : p.onDisabled} />
              )}
            </Pressable>
          </Animated.View>
          {!short && <Text style={styles.footnote}>Guess as often as you like. Get it before time runs out!</Text>}
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
    // "🍲 Food & Drink": the web can't shrink text to fit, so size long labels down.
    categoryLong: { fontSize: 38, lineHeight: 44 },
    categoryLongCompact: { fontSize: 28, lineHeight: 34 },
    // Room for a few lines of description and the typing line.
    feedWrap: { flex: 1, minHeight: 190 },
    // Short screens: a fixed height, so the feed scrolls itself to the newest words.
    feedWrapCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, height: 160 },
    feedCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
    preWord: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
    preWordTitle: { fontFamily: fonts.black, fontSize: 24, color: p.ink, textAlign: "center" },
    preWordSub: { ...type.body, color: p.muted },
    typingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 8 },
    typingText: { fontFamily: fonts.bold, fontSize: 16, color: p.ink },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 14, gap: 8 },
    footnote: { ...type.small, color: p.ink, textAlign: "center" },
    message: { ...type.bodyBold, color: p.danger, textAlign: "center" },
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
    cooldown: { fontFamily: fonts.black, fontSize: 20, color: p.onDisabled },
  });
