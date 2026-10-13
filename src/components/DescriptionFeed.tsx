import { Feather } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FeedEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { fonts, radius, useStyles, useTheme, type Palette } from '../theme';
import { OUTLINE } from './ui';

interface DescriptionFeedProps {
  entries: FeedEntry[];
  players: Record<string, RoomPlayer>;
  /** Show a dashed slot for the next word (the active Knower's own screen). */
  pendingLabel?: string;
  /** Shown when there's nothing in the feed yet. */
  emptyLabel?: string;
  /** `live` scrolls and follows the newest entry; `recap` lays everything out (Round Result). */
  variant?: 'live' | 'recap';
  /** Bigger words, for the Guesser, who has nothing else to look at. */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A round's description as it forms: the Knowers' words in order, each tinted with its
 * Knower's colour, the Guesser's guesses inline (so the Knowers can react), and turns that
 * ran out. Words struck by the leak check are shown crossed out.
 */
export function DescriptionFeed({
  entries,
  players,
  pendingLabel,
  emptyLabel,
  variant = 'live',
  large = false,
  style,
}: DescriptionFeedProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const words = entries.filter((e) => e.kind === 'word').map((e) => (e as { text: string }).text);
  const label = words.length ? `Description so far: ${words.join(' ')}` : 'No words yet';

  const items = entries.map((e, i) => {
    if (e.kind === 'word') {
      const colour = players[e.by]?.avatarColor ?? p.card;
      return (
        <View key={i} style={[styles.word, large && styles.wordLarge, { backgroundColor: tint(colour, p.isDark) }]}>
          <View style={[styles.dot, { backgroundColor: colour }]} />
          <Text style={[styles.wordText, large && styles.wordTextLarge, e.struck && styles.struck]}>{e.text}</Text>
        </View>
      );
    }
    if (e.kind === 'guess') {
      return (
        <View key={i} style={[styles.guess, e.correct && styles.guessCorrect]} accessibilityLabel={`Guess: ${e.text}, ${e.correct ? 'right' : 'wrong'}`}>
          <Feather name={e.correct ? 'check' : 'x'} size={large ? 18 : 16} color={e.correct ? p.onBlue : p.danger} />
          <Text style={[styles.guessText, large && styles.guessTextLarge, e.correct && { color: p.onBlue }]}>{e.text}{e.correct ? '!' : '?'}</Text>
        </View>
      );
    }
    return (
      <View key={i} style={styles.skip}>
        <Feather name="skip-forward" size={13} color={p.muted} />
        <Text style={styles.skipText}>{players[e.by]?.name ?? 'Knower'} skipped</Text>
      </View>
    );
  });

  const content = (
    <View style={styles.flow}>
      {entries.length === 0 && !pendingLabel && emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null}
      {items}
      {pendingLabel ? (
        <View style={[styles.pending, large && styles.wordLarge]}>
          <Text style={[styles.pendingText, large && styles.wordTextLarge]}>{pendingLabel}</Text>
        </View>
      ) : null}
    </View>
  );

  if (variant === 'recap') {
    return (
      <View style={style} accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={styles.scrollContent}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      {content}
    </ScrollView>
  );
}

/** A Knower's colour, softened enough to keep dark text readable on it. */
function tint(hex: string, dark: boolean): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `${hex}${dark ? '66' : '40'}`;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    scrollContent: { paddingBottom: 8, paddingRight: 4 },
    flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    empty: { fontFamily: fonts.bold, fontSize: 16, color: p.muted },
    word: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: radius.sm,
      paddingLeft: 8,
      paddingRight: 11,
      paddingVertical: 3,
    },
    wordLarge: { paddingVertical: 5, paddingRight: 14 },
    dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: p.line },
    wordText: { fontFamily: fonts.bold, fontSize: 20, color: p.ink },
    wordTextLarge: { fontSize: 26 },
    struck: { textDecorationLine: 'line-through', opacity: 0.5 },
    guess: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: p.danger,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      backgroundColor: p.card,
    },
    guessCorrect: { borderStyle: 'solid', borderColor: p.line, backgroundColor: p.blue },
    guessText: { fontFamily: fonts.bold, fontStyle: 'italic', fontSize: 16, color: p.ink },
    guessTextLarge: { fontSize: 19 },
    skip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
    skipText: { fontFamily: fonts.bold, fontSize: 13, color: p.muted },
    pending: {
      borderWidth: OUTLINE,
      borderStyle: 'dashed',
      borderColor: p.ink,
      borderRadius: radius.sm,
      paddingHorizontal: 11,
      paddingVertical: 3,
      backgroundColor: p.ghost,
    },
    pendingText: { fontFamily: fonts.bold, fontSize: 18, color: p.muted },
  });
