/**
 * Dev prototype screen — remove before ship.
 * Houses the 3-screen switcher from the original App.tsx.
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GuesserScreen } from '../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../src/screens/KnowerWaitingScreen';
import { colors, spacing, typography } from '../src/theme';

type DevScreen = 'knower-active' | 'knower-waiting' | 'guesser';
const SCREENS: DevScreen[] = ['knower-active', 'knower-waiting', 'guesser'];

const MOCK = {
  targetWord: 'Lighthouse',
  category: 'Objects',
  chain: ['sun', 'light'],
  durationSeconds: 30,
  secondsRemaining: 18,
  partnerName: 'Alex',
  partnerIsTyping: true,
  activeKnowerName: 'Alex',
  knowerIsTyping: true,
};

export default function DevScreen() {
  const [screen, setScreen] = useState<DevScreen>('knower-active');
  const [chain, setChain] = useState(MOCK.chain);

  return (
    <View style={styles.root}>
      {screen === 'knower-active' && (
        <KnowerActiveScreen
          targetWord={MOCK.targetWord}
          category={MOCK.category}
          chain={chain}
          durationSeconds={MOCK.durationSeconds}
          secondsRemaining={MOCK.secondsRemaining}
          onSubmitWord={(w) => {
            setChain((c) => [...c, w]);
            setScreen('knower-waiting');
          }}
        />
      )}
      {screen === 'knower-waiting' && (
        <KnowerWaitingScreen
          targetWord={MOCK.targetWord}
          category={MOCK.category}
          chain={chain}
          partnerName={MOCK.partnerName}
          partnerIsTyping={MOCK.partnerIsTyping}
          durationSeconds={MOCK.durationSeconds}
          secondsRemaining={MOCK.secondsRemaining}
        />
      )}
      {screen === 'guesser' && (
        <GuesserScreen
          category={MOCK.category}
          chain={chain}
          activeKnowerName={MOCK.activeKnowerName}
          knowerIsTyping={MOCK.knowerIsTyping}
          durationSeconds={MOCK.durationSeconds}
          secondsRemaining={MOCK.secondsRemaining}
          onGuess={(g) => console.log('Guess:', g)}
        />
      )}

      <View style={styles.switcher}>
        <Pressable
          style={styles.exitBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.exitText}>← Exit</Text>
        </Pressable>
        {SCREENS.map((s) => (
          <Pressable
            key={s}
            style={[styles.tab, screen === s && styles.tabActive]}
            onPress={() => setScreen(s)}
          >
            <Text style={[styles.tabText, screen === s && styles.tabTextActive]}>
              {s.replace(/-/g, '\n')}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  switcher: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  exitBtn: {
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitText: { ...typography.bodyMd, color: colors.primary },
  tab: {
    flex: 1,
    paddingVertical: spacing.stackSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { borderTopWidth: 2, borderTopColor: colors.primary },
  tabText: {
    ...typography.bodyMd,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
});
