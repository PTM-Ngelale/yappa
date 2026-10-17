import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, useStyles, useTheme, type Palette } from '../theme';
import { OUTLINE } from './ui';

/** Duo's clue budget, in place of the turn clock: a dot per clue, filled as they're spent. */
export function ClueBudget({ used, budget }: { used: number; budget: number }) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const left = Math.max(0, budget - used);
  const low = left <= 2;
  return (
    <View
      style={[styles.pill, low && { backgroundColor: p.coral }]}
      accessible
      accessibilityLabel={`${left} of ${budget} clues left`}
    >
      <View style={styles.dots}>
        {Array.from({ length: budget }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: low ? p.onCoral : p.ink },
              i < used && { backgroundColor: low ? p.onCoral : p.ink },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.text, low && { color: p.onCoral }]}>
        {left === 0 ? 'No clues left' : `${left} ${left === 1 ? 'clue' : 'clues'} left`}
      </Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: p.card,
    },
    dots: { flexDirection: 'row', gap: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    text: { fontFamily: fonts.bold, fontSize: 14, color: p.ink },
  });
