import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DescriptionFeed } from '../components/DescriptionFeed';
import { GameHeader, Prompt, SecretWordCard, TipCard, type WordMeaning } from '../components/game';
import { Pressable } from '../components/Pressable';
import { ClueBudget } from '../components/ClueBudget';
import { TurnClock } from '../components/TurnClock';
import { Eyebrow, OUTLINE, Screen, ScreenBody, useShortScreen } from '../components/ui';
import { MAX_WORD_LENGTH, ONE_WORD, ROUND_SECONDS } from '../game/config';
import { useShakeAnimation } from '../hooks/useShakeAnimation';
import type { FeedEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../theme';

interface KnowerActiveScreenProps {
  round: number;
  maxRounds: number;
  targetWord: string;
  /** What the secret word means: tapping the card shows it. */
  meaning?: WordMeaning;
  /** What's happening right now: your turn, a wrong guess to steer from, a turn that ran out. */
  prompt?: { text: string; tone: 'calm' | 'alert' };
  /** This round's first-game tip, if any. */
  tip?: { text: string; onDismiss: () => void };
  category: string;
  feed: FeedEntry[];
  players: Record<string, RoomPlayer>;
  /** This turn's clock: when it runs out the turn passes to the next Knower. */
  turnSeconds: number;
  /** The round's clock: when it runs out the round is lost. */
  roundSeconds: number;
  /** Hide the round timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
  /** Why the server turned the last word down, if it did (a new object each time). */
  notice?: { message: string } | null;
  /** Duo: the round's clue budget, shown instead of the turn clock. */
  clues?: { used: number; budget: number };
  /** Duo: the last word is still on its way; the next one waits for it. */
  sending?: boolean;
  onSubmitWord: (word: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

/** True if the candidate is the target or an obvious variant of it. Mirrors _is_target_variant(). */
function matchesTarget(candidate: string, target: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const c = norm(candidate);
  const t = norm(target);
  if (c === t) return true;
  const variants = [
    t + 's',
    t + 'es',
    t + 'ing',
    t + 'ed',
    t + 'er',
    t + 'ers',
    t.replace(/e$/, 'ing'), // dance → dancing
    t.replace(/e$/, 'ed'), // dance → danced
    t.replace(/y$/, 'ies'), // berry → berries
    t.replace(/y$/, 'ied'), // carry → carried
  ];
  return variants.includes(c);
}

export function KnowerActiveScreen({
  round,
  maxRounds,
  targetWord,
  meaning,
  prompt,
  tip,
  category,
  feed,
  players,
  turnSeconds,
  roundSeconds,
  showTimer = true,
  notice,
  clues,
  sending = false,
  onSubmitWord,
  onTypingChange,
}: KnowerActiveScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const [word, setWord] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const { shakeAnim, shake } = useShakeAnimation();
  const inputRef = useRef<TextInput>(null);

  const refuse = (message: string) => {
    shake();
    setValidationMsg(message);
  };

  // A word the server refused: say why, and shake.
  useEffect(() => {
    if (notice) refuse(notice.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  const lastWord = [...feed].reverse().find((e) => e.kind === 'word') as { text: string } | undefined;

  const outOfClues = !!clues && clues.used >= clues.budget;

  const handleSend = () => {
    const trimmed = word.trim();
    if (trimmed.length === 0 || sending || outOfClues) return;
    // Problems the player can fix keep their turn: say what's wrong, don't send.
    if (trimmed.length > MAX_WORD_LENGTH || !ONE_WORD.test(trimmed)) {
      refuse(`One word only: letters, with ' or - inside. Up to ${MAX_WORD_LENGTH} letters.`);
      return;
    }
    if (matchesTarget(trimmed, targetWord)) {
      refuse('That’s the secret word. Try a different one.');
      return;
    }
    if (lastWord && lastWord.text.toLowerCase() === trimmed.toLowerCase()) {
      refuse('That was the last word. Try another one.');
      return;
    }
    setValidationMsg('');
    onTypingChange?.(false);
    onSubmitWord(trimmed);
    setWord('');
  };

  // Space bar submits: a trailing space after some text sends the word.
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

  // Ref trick so handleSend inside handleChangeText sees the latest state.
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const canSend = word.trim().length > 0 && !sending && !outOfClues;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenBody style={styles.body}>
          <GameHeader
            round={round}
            maxRounds={maxRounds}
            role={clues ? 'Your clues' : 'Your turn'}
            roleBg={p.blue}
            roleFg={p.onBlue}
            durationSeconds={ROUND_SECONDS}
            secondsRemaining={roundSeconds}
            showTimer={showTimer}
            compact={short}
          />

          <SecretWordCard
            word={targetWord}
            category={category}
            hint="Give clues. Don’t say it."
            // Keep the keyboard up: on the web a tap elsewhere takes the focus from the input.
            meaning={meaning && { ...meaning, onToggle: () => { meaning.onToggle(); inputRef.current?.focus(); } }}
            compact={short}
          />
          {tip && !short && <TipCard text={tip.text} onDismiss={tip.onDismiss} />}

          <View style={[styles.feedSection, short && styles.feedSectionShort]}>
            {!short && <Eyebrow>The clues</Eyebrow>}
            <DescriptionFeed
              entries={feed}
              players={players}
              pendingLabel={feed.some((e) => e.kind === 'word') ? 'your word…' : 'first word…'}
              style={styles.flex}
            />
          </View>
        </ScreenBody>

        <View style={styles.inputSection}>
          {validationMsg !== '' ? (
            <Text style={styles.validationMsg} accessibilityLiveRegion="assertive">
              {validationMsg}
            </Text>
          ) : outOfClues ? (
            <Prompt text="That’s all your clues. Fingers crossed!" />
          ) : (
            prompt && <Prompt text={prompt.text} tone={prompt.tone} />
          )}
          {clues ? <ClueBudget used={clues.used} budget={clues.budget} /> : <TurnClock label="Your word" seconds={turnSeconds} />}
          <Animated.View style={[styles.inputRow, { transform: [{ translateX: shakeAnim }] }]}>
            <View style={styles.inputWrap}>
              <View style={styles.inputShadow} />
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={word}
                onChangeText={handleChangeText}
                placeholder={outOfClues ? 'No clues left' : 'Add one word…'}
                placeholderTextColor={p.muted}
                editable={!outOfClues}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_WORD_LENGTH + 1}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                accessibilityLabel="Your word"
              />
            </View>
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send word"
              accessibilityState={{ disabled: !canSend }}
            >
              {({ pressed }) => (
                <View style={styles.sendWrap}>
                  {canSend && <View style={styles.sendShadow} />}
                  <View style={[styles.send, !canSend && styles.sendDisabled, pressed && canSend && styles.sendPressed]}>
                    <Feather name="arrow-right" size={26} color={canSend ? p.onCoral : p.onDisabled} />
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
          {!short && <Text style={styles.small}>Space bar sends it.</Text>}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    body: { paddingHorizontal: spacing.screen, paddingTop: 10, gap: 16 },
    // Room for a few lines of description however short the screen.
    feedSection: { flex: 1, gap: 10, minHeight: 110 },
    // Short screens: a fixed height, so the feed scrolls itself to the newest words (inside
    // the screen's own scroll view a stretchy area would just grow to fit them all).
    // (flexBasis 'auto': on the web a 0 basis would override the height.)
    feedSectionShort: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, height: 92 },
    inputSection: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 12, gap: 8 },
    validationMsg: { ...type.bodyBold, color: p.danger, textAlign: 'center' },
    inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    inputWrap: { flex: 1, paddingRight: 4, paddingBottom: 4 },
    inputShadow: {
      ...StyleSheet.absoluteFillObject,
      top: 4,
      left: 4,
      borderRadius: radius.md + 2,
      backgroundColor: p.line,
    },
    input: {
      // Keeps the input above its shadow layer on web, where positioned elements paint
      // over unpositioned ones regardless of order.
      position: 'relative',
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.card,
      paddingHorizontal: 18,
      fontFamily: fonts.bold,
      fontSize: 22,
      color: p.ink,
    },
    sendWrap: { paddingRight: 4, paddingBottom: 4 },
    sendShadow: {
      ...StyleSheet.absoluteFillObject,
      top: 4,
      left: 4,
      borderRadius: radius.md + 2,
      backgroundColor: p.line,
    },
    send: {
      position: 'relative',
      width: 60,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.coral,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendDisabled: { backgroundColor: p.disabled },
    sendPressed: { transform: [{ translateX: 3 }, { translateY: 3 }] },
    small: { ...type.small, fontSize: 13, color: p.ink },
  });
