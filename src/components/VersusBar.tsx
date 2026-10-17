// Versus mode in the game screens: which team you're on and how the other team is getting
// on. The screens get it through context (set in app/game/round.tsx), like the leave button,
// so each header can show it without threading a prop through every screen.
import React, { createContext, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { otherTeam, teamColors, teamName } from '../game/versus';
import type { Team } from '../supabase/room';
import { fonts, useStyles, useTheme, type Palette } from '../theme';
import { Pill } from './ui';

export type VersusInfo = {
  team: Team;
  /** The other team's clues and guesses this round. */
  rival: { clues: number; guesses: number };
};

/** This player's versus game; null outside versus. */
export const VersusContext = createContext<VersusInfo | null>(null);

export function useVersus(): VersusInfo | null {
  return useContext(VersusContext);
}

/** "Red" pill and "Blue: 4 clues · 1 guess". Renders nothing outside versus. */
export function VersusBar({ compact = false }: { compact?: boolean }) {
  const versus = useVersus();
  const styles = useStyles(makeStyles);
  const p = useTheme();
  if (!versus) return null;
  const mine = teamColors(p, versus.team);
  const rival = otherTeam(versus.team);
  const { clues, guesses } = versus.rival;
  const progress = `${clues} ${clues === 1 ? 'clue' : 'clues'} · ${guesses} ${guesses === 1 ? 'guess' : 'guesses'}`;
  return (
    <View
      style={styles.bar}
      accessible
      accessibilityLabel={`You're on ${teamName(versus.team)}. ${teamName(rival)} so far: ${progress}`}
      accessibilityLiveRegion="polite"
    >
      <Pill label={teamName(versus.team)} bg={mine.bg} fg={mine.fg} size={compact ? 13 : 14} />
      <View style={[styles.dot, { backgroundColor: teamColors(p, rival).bg }]} />
      <Text style={styles.rival} numberOfLines={1}>
        {teamName(rival)}: {progress}
      </Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: p.line, marginLeft: 4 },
    rival: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: p.ink },
  });
