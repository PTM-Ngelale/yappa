import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TypingIndicator } from '../components/TypingIndicator';
import { Eyebrow, OUTLINE, Pill, Screen, ScreenBody, Sticker, StickerButton, useShortScreen } from '../components/ui';
import { DescriptionFeed } from '../components/DescriptionFeed';
import { OffLimits } from '../components/game';
import { LeaveGameButton } from '../components/LeaveGame';
import { Pressable } from '../components/Pressable';
import type { FeedEntry, RoundOutcome } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../theme';

const AUTO_ADVANCE_SECONDS = 5;

interface RoundResolutionScreenProps {
  round: number;
  maxRounds: number;
  outcome: RoundOutcome;
  targetWord: string;
  /** The word's off-limits words, revealed to everyone now (empty in games without them). */
  offLimits?: string[];
  /** The winning guess: null when time ran out. Shown so lenient matches are visible. */
  guess: string | null;
  guesserName: string;
  /** True on the Guesser's own device, to say "You guessed" instead of their name. */
  isMyGuess: boolean;
  /** The round's description, guesses included. */
  feed: FeedEntry[];
  players: Record<string, RoomPlayer>;
  /** How long the round took. */
  durationMs?: number;
  /** Words the Knowers needed. */
  wordCount?: number;
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
  offLimits = [],
  guess,
  guesserName,
  isMyGuess,
  feed,
  players,
  durationMs,
  wordCount,
  results,
  isHost,
  onReport,
  onNextRound,
}: RoundResolutionScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const won = outcome === 'won';
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

  const ground = won ? p.blue : p.coral;
  const onGround = won ? p.onBlue : p.onCoral;
  const headline = won ? 'Got it!' : outcome === 'lost-timeout' ? 'Time’s up' : 'Not quite';
  const who = isMyGuess ? 'You' : guesserName;
  const sub = won
    ? `${who} guessed “${guess ?? targetWord}”`
    : guess
      ? `${who} guessed “${guess}”. It was ${targetWord}`
      : `The word was ${targetWord}`;
  const seconds = durationMs !== undefined ? Math.round(durationMs / 1000) : null;
  const facts = [
    won && wordCount !== undefined ? `Got it in ${wordCount} word${wordCount === 1 ? '' : 's'}` : null,
    seconds !== null ? `${seconds}s` : null,
  ].filter(Boolean).join(' · ');
  const wins = results.filter((r) => r === 'won').length;
  const isLastRound = round >= maxRounds;

  return (
    <Screen ground={ground}>
      <View pointerEvents="none" style={[styles.blob, { backgroundColor: won ? p.yellow : p.blue }]} />

      <ScreenBody style={styles.body}>
        <View style={styles.topRow}>
          <Pill label={`Round ${round} / ${maxRounds}`} />
          <LeaveGameButton />
        </View>

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
          <Eyebrow>The clues</Eyebrow>
          <DescriptionFeed entries={feed} players={players} variant="recap" emptyLabel="No words this round" />
          <View style={styles.answerRow}>
            <Text style={styles.answerLabel}>The word</Text>
            <Sticker bg={p.yellow} radius={10} offset={3} contentStyle={styles.answerChip}>
              <Text style={[styles.answerText, { color: p.onYellow }]}>{targetWord}</Text>
            </Sticker>
          </View>
          {offLimits.length > 0 && <OffLimits words={offLimits} />}
          {facts !== '' && <Text style={styles.facts}>{facts}</Text>}
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
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
    answerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    answerLabel: { fontFamily: fonts.bold, fontSize: 15, color: p.muted },
    answerChip: { paddingHorizontal: 11, paddingVertical: 3 },
    answerText: { fontFamily: fonts.black, fontSize: 21 },
    facts: { ...type.small, fontFamily: fonts.bold, color: p.muted },
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
