import { Feather } from '@expo/vector-icons';
import React, { useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { fonts, radius, useStyles, useTheme, type Palette } from '../theme';
import { Pressable } from './Pressable';
import { OUTLINE, Sticker } from './ui';

interface WordChainProps {
  words: string[];
  /**
   * `stack` — Knower screens: words run down the screen.
   * `center` — Guesser: older words fade, the newest is big.
   * `wrap` — Round Resolution: words flow across and wrap, links are tappable.
   * `row` — Knower screens on a short screen: one line, scrolled to the newest word.
   */
  variant?: 'stack' | 'center' | 'wrap' | 'row';
  /** Highlight the last word as the one to link to (Knower screens). */
  emphasiseLast?: boolean;
  /** Show a dashed slot for the next word. */
  showPending?: boolean;
  /** Text in the dashed slot. */
  pendingLabel?: string;
  /** Shown in place of the chain when `words` is empty. */
  emptyState?: React.ReactNode;
  /** Highlight the last word as the revealed target (wrap variant). */
  highlightLast?: boolean;
  /**
   * AI link-validation results keyed by word index (see checkLink()) — index i marks the
   * link between words[i-1] and words[i]. Advisory only; only 'invalid' is drawn.
   */
  linkStatus?: Record<number, 'valid' | 'invalid'>;
  /** Manually flagged link indices (a player tapping a link on Round Resolution). */
  flaggedIndices?: Set<number>;
  /** Makes each link tappable — index i is the link before words[i]. */
  onLinkPress?: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function WordChain({
  words,
  variant = 'stack',
  emphasiseLast = false,
  showPending = false,
  pendingLabel = 'next word…',
  emptyState,
  highlightLast = false,
  linkStatus,
  flaggedIndices,
  onLinkPress,
  style,
}: WordChainProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const label = `Word chain: ${words.join(', ')}`;

  if (words.length === 0 && !showPending) {
    return <View style={[styles.empty, style]}>{emptyState}</View>;
  }

  if (variant === 'wrap') {
    return (
      <View style={[styles.wrap, style]} accessibilityLabel={label}>
        {words.map((word, i) => {
          const flagged = linkStatus?.[i] === 'invalid' || !!flaggedIndices?.has(i);
          const isTarget = highlightLast && i === words.length - 1;
          const chip = isTarget ? (
            <Sticker bg={p.yellow} radius={radius.sm} offset={3} contentStyle={styles.wrapChip}>
              <Text style={[styles.wrapText, styles.wrapTarget, { color: p.onYellow }]}>{word}</Text>
            </Sticker>
          ) : (
            <View style={[styles.wrapChip, styles.wrapChipPlain, flagged && styles.wrapChipFlagged]}>
              <Text style={styles.wrapText}>{word}</Text>
            </View>
          );
          // An arrow always travels with the word after it, so a line never ends on one.
          return (
            <View key={i} style={styles.wrapGroup}>
              {i > 0 &&
                (onLinkPress ? (
                  <Pressable
                    onPress={() => onLinkPress(i)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`${flagged ? 'Unflag' : 'Flag'} the link from "${words[i - 1]}" to "${word}"`}
                    style={styles.wrapLink}
                  >
                    <LinkArrow flagged={flagged} />
                  </Pressable>
                ) : (
                  <View style={styles.wrapLink}>
                    <LinkArrow flagged={flagged} />
                  </View>
                ))}
              {chip}
            </View>
          );
        })}
      </View>
    );
  }

  if (variant === 'row') {
    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        style={style}
        contentContainerStyle={styles.rowContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={label}
      >
        {words.map((word, i) => {
          const emphasise = emphasiseLast && i === words.length - 1;
          return (
            <View key={i} style={styles.rowItem}>
              {i > 0 && <Feather name="arrow-right" size={18} color={p.ink} />}
              <Sticker bg={emphasise ? p.blue : p.card} radius={radius.sm} offset={3} contentStyle={styles.wrapChip}>
                <Text style={[styles.wrapText, emphasise && { color: p.onBlue, fontFamily: fonts.black }]}>
                  {word}
                </Text>
              </Sticker>
            </View>
          );
        })}
        {showPending && (
          <View style={styles.rowItem}>
            {words.length > 0 && <Feather name="more-horizontal" size={18} color={p.ink} />}
            <View style={[styles.pending, styles.rowPending]}>
              <Text style={[styles.pendingText, styles.rowPendingText]}>{pendingLabel}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    );
  }

  if (variant === 'center') {
    return (
      <ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={styles.centerContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        accessibilityLabel={label}
      >
        {words.map((word, i) => {
          const isLast = i === words.length - 1;
          const age = words.length - 1 - i;
          return (
            <View key={i} style={styles.centerItem}>
              {i > 0 && <Feather name="arrow-down" size={22} color={p.ink} />}
              {isLast ? (
                <Sticker bg={p.blue} radius={18} contentStyle={styles.centerLast}>
                  <Text style={styles.centerLastText} adjustsFontSizeToFit numberOfLines={1}>
                    {word}
                  </Text>
                </Sticker>
              ) : (
                <Text
                  style={[
                    styles.centerText,
                    age === 1 ? styles.centerRecent : styles.centerOld,
                  ]}
                >
                  {word}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={styles.stackContent}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      accessibilityLabel={label}
    >
      {words.map((word, i) => {
        const emphasise = emphasiseLast && i === words.length - 1;
        return (
          <View key={i} style={styles.stackItem}>
            {i > 0 && (
              <View style={styles.stackArrow}>
                <Feather name="arrow-down" size={22} color={p.ink} />
              </View>
            )}
            <View style={styles.stackRow}>
              <Sticker
                bg={emphasise ? p.blue : p.card}
                radius={radius.md}
                offset={emphasise ? 4 : 3}
                contentStyle={styles.stackChip}
              >
                <Text
                  style={[
                    styles.stackText,
                    emphasise && { color: p.onBlue, fontFamily: fonts.black, fontSize: 26 },
                  ]}
                >
                  {word}
                </Text>
              </Sticker>
              {emphasise && (
                <View style={styles.linkTag}>
                  <Text style={styles.linkTagText}>link to this</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
      {showPending && (
        <View style={styles.stackItem}>
          {words.length > 0 && (
            <View style={styles.stackArrow}>
              <Feather name="more-vertical" size={22} color={p.ink} />
            </View>
          )}
          <View style={styles.pending}>
            <Text style={styles.pendingText}>{pendingLabel}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function LinkArrow({ flagged }: { flagged: boolean }) {
  const p = useTheme();
  return (
    <View accessibilityLabel={flagged ? 'Flagged link' : undefined}>
      <Feather name="arrow-right" size={18} color={flagged ? p.danger : p.ink} />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    empty: { alignItems: 'center', justifyContent: 'center' },

    // stack
    stackContent: { paddingBottom: 8, paddingRight: 4 },
    stackItem: { alignItems: 'flex-start' },
    stackArrow: { marginLeft: 18, marginVertical: 2 },
    stackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stackChip: { paddingHorizontal: 16, paddingVertical: 6 },
    stackText: { fontFamily: fonts.bold, fontSize: 22, color: p.ink },
    linkTag: {
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: p.ink,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 3,
      backgroundColor: p.card,
    },
    linkTagText: { fontFamily: fonts.bold, fontSize: 14, color: p.ink },
    pending: {
      borderWidth: OUTLINE,
      borderStyle: 'dashed',
      borderColor: p.ink,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: p.ghost,
    },
    pendingText: { fontFamily: fonts.bold, fontSize: 20, color: p.muted },

    // row
    rowContent: { alignItems: 'center', gap: 8, paddingRight: 4, paddingBottom: 4 },
    rowItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowPending: { paddingHorizontal: 11, paddingVertical: 3, borderRadius: radius.sm },
    rowPendingText: { fontSize: 17 },

    // center
    centerContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
    centerItem: { alignItems: 'center', gap: 6 },
    centerText: { fontFamily: fonts.bold, color: p.ink },
    centerRecent: { fontSize: 34 },
    centerOld: { fontSize: 26, color: p.muted },
    centerLast: { paddingHorizontal: 20, paddingVertical: 4 },
    centerLastText: { fontFamily: fonts.black, fontSize: 42, letterSpacing: -1, color: p.onBlue },

    // wrap
    wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 10, columnGap: 8 },
    wrapGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    wrapLink: { paddingVertical: 4 },
    wrapChip: { paddingHorizontal: 11, paddingVertical: 3 },
    wrapChipPlain: { borderWidth: OUTLINE, borderColor: p.line, borderRadius: radius.sm },
    wrapChipFlagged: { borderStyle: 'dashed', borderColor: p.danger },
    wrapText: { fontFamily: fonts.bold, fontSize: 19, color: p.ink },
    wrapTarget: { fontFamily: fonts.black, fontSize: 21 },
  });
