import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TypingIndicator } from '../components/TypingIndicator';
import { Eyebrow, OUTLINE, Pill, Screen, ScreenBody, Sticker, StickerButton, useShortScreen } from '../components/ui';
import { Pressable } from '../components/Pressable';
import { WordChain } from '../components/WordChain';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../theme';

const AUTO_ADVANCE_SECONDS = 5;

interface RoundResolutionScreenProps {
  round: number;
  maxRounds: number;
  outcome: 'won' | 'lost-guess' | 'lost-timeout';
  targetWord: string;
  /** What the Guesser typed — null on a timeout. Shown so lenient matches are visible. */
  guess: string | null;
  guesserName: string;
  /** True on the Guesser's own device, to say "You guessed" instead of their name. */
  isMyGuess: boolean;
  chain: string[];
  /** AI link-validation results keyed by chain index — advisory only, never affects score. */
  linkChecks?: Record<number, 'valid' | 'invalid'>;
  /** Outcome of every round played so far, in order, including this one. */
  results: Array<'won' | 'lost'>;
  isHost: boolean;
  /** Public games only: opens the report sheet. */
  onReport?: () => void;
  onNextRound: () => void;
}

export function RoundResolutionScreen({
  round,
  maxRounds,
  outcome,
  targetWord,
  guess,
  guesserName,
  isMyGuess,
  chain,
  linkChecks,
  results,
  isHost,
  onReport,
  onNextRound,
}: RoundResolutionScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const won = outcome === 'won';
  const [manualFlags, setManualFlags] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(AUTO_ADVANCE_SECONDS);
  const advancedRef = useRef(false);

  // Host: auto-advance after a few seconds so a stalled room never blocks.
  useEffect(() => {
    if (!isHost) return;
    advancedRef.current = false;
    setSecondsLeft(AUTO_ADVANCE_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!advancedRef.current) {
            advancedRef.current = true;
            onNextRound();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // Re-arm only when the round we're resolving changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, round]);

  const handleNextPress = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onNextRound();
  };

  // Chain + revealed target, as one visual sequence.
  const fullChain = [...chain, targetWord];
  const aiFlagged = Object.entries(linkChecks ?? {})
    .filter(([, status]) => status === 'invalid')
    .map(([i]) => Number(i));

  const toggleFlag = (index: number) => {
    setManualFlags((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const ground = won ? p.blue : p.coral;
  const onGround = won ? p.onBlue : p.onCoral;
  const headline = won ? 'Got it!' : outcome === 'lost-timeout' ? 'Time’s up' : 'Not quite';
  const who = isMyGuess ? 'You' : guesserName;
  const sub = won
    ? `${who} guessed “${guess ?? targetWord}”`
    : guess
      ? `${who} guessed “${guess}” — it was ${targetWord}`
      : `The word was ${targetWord}`;
  const wins = results.filter((r) => r === 'won').length;
  const isLastRound = round >= maxRounds;
  const anyFlag = aiFlagged.length > 0 || manualFlags.size > 0;

  let flagNote = 'Tap an arrow to flag a link that doesn’t work';
  if (manualFlags.size > 0) {
    flagNote = `Thanks — ${manualFlags.size} link${manualFlags.size === 1 ? '' : 's'} flagged`;
  } else if (aiFlagged.length > 0) {
    const i = aiFlagged[0];
    flagNote = `${fullChain[i - 1]} → ${fullChain[i]} may not be a real link`;
  }

  return (
    <Screen ground={ground}>
      <View pointerEvents="none" style={[styles.blob, { backgroundColor: won ? p.yellow : p.blue }]} />

      <ScreenBody style={styles.body}>
        <Pill label={`Round ${round} / ${maxRounds}`} />

        <View style={styles.hero}>
          <Sticker radius={22} offset={6} style={styles.headlineWrap} contentStyle={styles.headline}>
            <Feather name={won ? 'check' : 'x'} size={38} color={p.ink} />
            <Text style={[styles.headlineText, short && styles.headlineCompact]} accessibilityRole="header">
              {headline}
            </Text>
          </Sticker>
          <Text style={[styles.sub, { color: onGround }]}>{sub}</Text>
        </View>

        <Sticker radius={24} offset={6} contentStyle={styles.chainCard}>
          <Eyebrow>How you got there</Eyebrow>
          <WordChain
            words={fullChain}
            variant="wrap"
            highlightLast
            linkStatus={linkChecks}
            flaggedIndices={manualFlags}
            onLinkPress={toggleFlag}
          />
          <View style={styles.flagNote}>
            <Feather name="flag" size={15} color={anyFlag ? p.danger : p.muted} />
            <Text style={[styles.flagText, anyFlag && { color: p.danger }]}>{flagNote}</Text>
          </View>
        </Sticker>

        <View style={styles.score}>
          <View style={styles.scoreTop}>
            <Eyebrow style={{ color: onGround }}>Team score</Eyebrow>
            <Text style={[styles.scoreText, { color: onGround }]}>
              {wins} of {results.length} won
            </Text>
          </View>
          <View
            style={styles.blocks}
            accessible
            accessibilityLabel={`${wins} won, ${results.length - wins} lost, ${maxRounds - results.length} to play`}
          >
            {Array.from({ length: maxRounds }).map((_, i) => {
              const r = results[i];
              return (
                <View
                  key={i}
                  style={[
                    styles.block,
                    r === 'won' && { backgroundColor: p.yellow },
                    r === 'lost' && { backgroundColor: p.card },
                    !r && { backgroundColor: 'rgba(255,255,255,0.28)' },
                  ]}
                >
                  {r === 'lost' && <Feather name="x" size={14} color={p.ink} />}
                </View>
              );
            })}
          </View>
        </View>
      </ScreenBody>

      <View style={styles.footer}>
        {isHost ? (
          <>
            <StickerButton
              label={isLastRound ? 'See results' : 'Next round'}
              variant={won ? 'yellow' : 'card'}
              height={64}
              onPress={handleNextPress}
            />
            <Text style={[styles.footnote, { color: onGround }]}>
              Starting automatically in {secondsLeft}s
            </Text>
          </>
        ) : (
          <View style={styles.waiting}>
            <TypingIndicator />
            <Text style={styles.waitingText}>Waiting for the host…</Text>
          </View>
        )}
        {onReport && (
          <Pressable onPress={onReport} accessibilityRole="button" style={styles.report} sound={false}>
            <Feather name="flag" size={14} color={onGround} />
            <Text style={[styles.reportText, { color: onGround }]}>Report a player</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    blob: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 130,
      borderWidth: OUTLINE,
      borderColor: p.line,
      top: -110,
      right: -90,
    },
    body: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 8, gap: 18 },
    hero: { gap: 10, marginTop: 8 },
    headlineWrap: { alignSelf: 'flex-start', transform: [{ rotate: '-3deg' }] },
    headline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 4 },
    headlineText: { fontFamily: fonts.black, fontSize: 52, lineHeight: 60, letterSpacing: -2, color: p.ink },
    headlineCompact: { fontSize: 38, lineHeight: 46 },
    sub: { fontFamily: fonts.bold, fontSize: 18, marginLeft: 4 },
    chainCard: { padding: 16, gap: 12 },
    flagNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    flagText: { ...type.small, flex: 1, fontFamily: fonts.bold, color: p.muted },
    score: { gap: 8 },
    scoreTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    scoreText: { fontFamily: fonts.black, fontSize: 20 },
    blocks: { flexDirection: 'row', gap: 6 },
    block: {
      flex: 1,
      height: 26,
      borderRadius: 8,
      borderWidth: OUTLINE,
      borderColor: p.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: { paddingHorizontal: spacing.screen, paddingBottom: 14, paddingTop: 10, gap: 8 },
    footnote: { ...type.small, fontFamily: fonts.bold, textAlign: 'center' },
    report: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
    reportText: { fontFamily: fonts.bold, fontSize: 14, textDecorationLine: 'underline' },
    waiting: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: p.card,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: 20,
      paddingVertical: 16,
    },
    waitingText: { fontFamily: fonts.bold, fontSize: 17, color: p.ink },
  });
