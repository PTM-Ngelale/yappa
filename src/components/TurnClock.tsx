import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, useStyles, useTheme, type Palette } from '../theme';
import { OUTLINE } from './ui';

/** The turn clock: whose turn it is and the seconds left before it passes to the other Knower. */
export function TurnClock({ label, seconds, urgent }: { label: string; seconds: number; urgent?: boolean }) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const hurry = urgent ?? seconds <= 3;
  return (
    <View
      style={[styles.pill, hurry && { backgroundColor: p.coral }]}
      accessibilityRole="timer"
      accessibilityLabel={`${label}, ${seconds} seconds left`}
    >
      <Feather name="clock" size={14} color={hurry ? p.onCoral : p.ink} />
      <Text style={[styles.text, hurry && { color: p.onCoral }]}>
        {label} · {seconds}s
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
      gap: 6,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      backgroundColor: p.card,
    },
    text: { fontFamily: fonts.bold, fontSize: 14, color: p.ink },
  });
