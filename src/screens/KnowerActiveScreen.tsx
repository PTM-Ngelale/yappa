import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GameHeader, SecretWordCard } from '../components/game';
import { Pressable } from '../components/Pressable';
import { Eyebrow, OUTLINE, Screen, ScreenBody, useShortScreen } from '../components/ui';
import { WordChain } from '../components/WordChain';
import { useShakeAnimation } from '../hooks/useShakeAnimation';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../theme';

interface KnowerActiveScreenProps {
  round: number;
  maxRounds: number;
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
  maxRounds,
  targetWord,
  category,
  chain,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
  onSubmitWord,
  onTypingChange,
}: KnowerActiveScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const [word, setWord] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const { shakeAnim, shake } = useShakeAnimation();
  const inputRef = useRef<TextInput>(null);
  const short = useShortScreen();

  const handleSend = () => {
    const trimmed = word.trim();
    if (trimmed.length === 0) return;

    if (matchesTarget(trimmed, targetWord)) {
      shake();
      setValidationMsg("That's the secret word — try a different one.");
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
  const lastWord = chain[chain.length - 1];

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScreenBody style={styles.body}>
          <GameHeader
            round={round}
            maxRounds={maxRounds}
            role="Your turn"
            roleBg={p.blue}
            roleFg={p.onBlue}
            durationSeconds={durationSeconds}
            secondsRemaining={secondsRemaining}
            showTimer={showTimer}
          />

          <SecretWordCard word={targetWord} category={category} hint="Don’t say it. Lead them to it." compact={short} />

          <View style={short ? styles.chainRow : styles.chainSection}>
            {!short && <Eyebrow>The chain</Eyebrow>}
            <WordChain
              words={chain}
              variant={short ? 'row' : 'stack'}
              emphasiseLast
              showPending
              pendingLabel={chain.length === 0 ? 'first word…' : 'your word…'}
              style={short ? undefined : styles.flex}
            />
          </View>

          <Text style={styles.hint}>
            {lastWord ? (
              <>
                One word that makes a compound or phrase with{' '}
                <Text style={styles.hintStrong}>{lastWord}</Text>.
              </>
            ) : (
              'You go first — pick an opening word that points toward the secret.'
            )}
          </Text>
        </ScreenBody>

        <View style={styles.inputSection}>
          {validationMsg !== '' && (
            <Text style={styles.validationMsg} accessibilityLiveRegion="assertive">
              {validationMsg}
            </Text>
          )}
          {!short && <Eyebrow>Your word</Eyebrow>}
          <Animated.View style={[styles.inputRow, { transform: [{ translateX: shakeAnim }] }]}>
            <View style={styles.inputWrap}>
              <View style={styles.inputShadow} />
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={word}
                onChangeText={handleChangeText}
                placeholder="Type a word…"
                placeholderTextColor={p.muted}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
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
                  <View
                    style={[
                      styles.send,
                      !canSend && styles.sendDisabled,
                      pressed && canSend && styles.sendPressed,
                    ]}
                  >
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
    // Never shorter than the word to link to plus the slot for yours.
    chainSection: { flex: 1, gap: 10, minHeight: 150 },
    chainRow: { flexGrow: 1 },
    hint: { ...type.small, fontSize: 15, color: p.ink },
    hintStrong: { fontFamily: fonts.black },
    inputSection: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 12, gap: 6 },
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
