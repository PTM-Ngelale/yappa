import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { categoryLabel } from '../game/categories';
import { fonts, type, useStyles, useTheme, type Palette } from '../theme';
import { TimerBar } from './TimerBar';
import { Eyebrow, Pill, Sticker } from './ui';

/** Round pill, role pill and (optionally) the turn timer — the top of every gameplay screen. */
export function GameHeader({
  round,
  maxRounds,
  role,
  roleBg,
  roleFg,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
  compact = false,
}: {
  round: number;
  maxRounds: number;
  role: string;
  roleBg?: string;
  roleFg?: string;
  durationSeconds: number;
  secondsRemaining: number;
  showTimer?: boolean;
  /** Short screens: round and timer on one line, no role pill. */
  compact?: boolean;
}) {
  const styles = useStyles(makeStyles);
  if (compact) {
    return (
      <View style={styles.compact}>
        <Pill label={`${round} / ${maxRounds}`} />
        {showTimer && (
          <View style={styles.flex}>
            <TimerBar durationSeconds={durationSeconds} secondsRemaining={secondsRemaining} />
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.header}>
      <View style={styles.pills}>
        <Pill label={`Round ${round} / ${maxRounds}`} />
        <Pill label={role} bg={roleBg} fg={roleFg} />
      </View>
      {showTimer && <TimerBar durationSeconds={durationSeconds} secondsRemaining={secondsRemaining} />}
    </View>
  );
}

/** The inverted card holding the word only the Knowers see. */
export function SecretWordCard({
  word,
  category,
  hint,
  compact = false,
}: {
  word: string;
  category: string;
  hint?: string;
  /** Short screens: smaller word, no hint. */
  compact?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  return (
    <Sticker bg={p.hero} shadow={p.coral} radius={24} offset={5} contentStyle={styles.secret}>
      <View style={styles.secretTop}>
        <Eyebrow style={{ color: p.heroAccent }}>Secret word</Eyebrow>
        <View style={[styles.category, { backgroundColor: p.heroAccent }]}>
          <Text style={[styles.categoryText, { color: p.hero }]}>{categoryLabel(category)}</Text>
        </View>
      </View>
      <Text style={[styles.secretWord, compact && styles.secretWordCompact]} adjustsFontSizeToFit numberOfLines={1}>
        {word}
      </Text>
      {hint && !compact && <Text style={styles.secretHint}>{hint}</Text>}
    </Sticker>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    header: { gap: 14 },
    compact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    flex: { flex: 1 },
    pills: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    secret: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 4 },
    secretTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    category: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    categoryText: { fontFamily: fonts.bold, fontSize: 13 },
    secretWord: { fontFamily: fonts.black, fontSize: 44, lineHeight: 50, letterSpacing: -1, color: p.onHero },
    secretWordCompact: { fontSize: 32, lineHeight: 38 },
    secretHint: { ...type.small, color: p.onHero, opacity: 0.9 },
  });
