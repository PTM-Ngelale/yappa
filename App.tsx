import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GuesserScreen } from './src/screens/GuesserScreen';
import { KnowerActiveScreen } from './src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from './src/screens/KnowerWaitingScreen';
import { colors, spacing, typography } from './src/theme';

type DevScreen = 'knower-active' | 'knower-waiting' | 'guesser';
const SCREENS: DevScreen[] = ['knower-active', 'knower-waiting', 'guesser'];

// Shared mock state — reflects a mid-round scenario
const MOCK = {
  targetWord: 'Lighthouse',
  category: 'Objects',
  chain: ['sun', 'light'],           // "sun → light" — next word must link to "light"
  durationSeconds: 30,
  secondsRemaining: 18,
  partnerName: 'Alex',
  partnerIsTyping: true,
  activeKnowerName: 'Alex',
  knowerIsTyping: true,
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
  });

  const [screen, setScreen] = useState<DevScreen>('knower-active');
  const [chain, setChain] = useState(MOCK.chain);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <View style={styles.root}>
      <StatusBar style="dark" />

      {screen === 'knower-active' && (
        <KnowerActiveScreen
          targetWord={MOCK.targetWord}
          category={MOCK.category}
          chain={chain}
          durationSeconds={MOCK.durationSeconds}
          secondsRemaining={MOCK.secondsRemaining}
          onSubmitWord={w => {
            console.log('Word submitted:', w);
            setChain(c => [...c, w]);
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
          onGuess={g => console.log('Guess submitted:', g)}
        />
      )}

      {/* Dev switcher — remove before ship */}
      <View style={styles.switcher}>
        {SCREENS.map(s => (
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  switcher: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
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
