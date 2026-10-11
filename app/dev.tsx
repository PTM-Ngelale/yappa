/**
 * Dev prototype screen — remove before ship.
 * Previews the gameplay screens with mock data, without needing three players.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../src/components/Pressable';
import { GameEndScreen } from '../src/screens/GameEndScreen';
import { GuesserScreen } from '../src/screens/GuesserScreen';
import { KnowerActiveScreen } from '../src/screens/KnowerActiveScreen';
import { KnowerWaitingScreen } from '../src/screens/KnowerWaitingScreen';
import { RoundIntroScreen } from '../src/screens/RoundIntroScreen';
import { RoundResolutionScreen } from '../src/screens/RoundResolutionScreen';
import type { RoundHistoryEntry } from '../src/supabase/room';
import { fonts, useStyles, type Palette } from '../src/theme';

type DevScreen = 'intro' | 'knower-active' | 'knower-waiting' | 'guesser' | 'result' | 'game-end';
const SCREENS: DevScreen[] = ['intro', 'knower-active', 'knower-waiting', 'guesser', 'result', 'game-end'];

const MOCK = {
  round: 3,
  maxRounds: 9,
  targetWord: 'Lighthouse',
  category: 'Places',
  chain: ['sea', 'shell'],
  durationSeconds: 30,
  secondsRemaining: 18,
  partnerName: 'Tomi',
  partnerIsTyping: true,
  activeKnowerName: 'Tomi',
  knowerIsTyping: true,
};

const MOCK_HISTORY: RoundHistoryEntry[] = [
  { round: 1, category: 'Objects', targetWord: 'Backpack', chain: ['back', 'pack'], guesserUid: 'b', outcome: 'won', guess: 'backpack', linkChecks: {} },
  { round: 2, category: 'Animals', targetWord: 'Penguin', chain: ['ice', 'berg'], guesserUid: 'c', outcome: 'lost-timeout', guess: null, linkChecks: {} },
  { round: 3, category: 'Places', targetWord: 'Lighthouse', chain: ['sea', 'shell', 'fish'], guesserUid: 'a', outcome: 'won', guess: 'lighthouse', linkChecks: {} },
];
const MOCK_PLAYERS = {
  a: { uid: 'a', name: 'Kemi', avatarColor: '#3B5BFF', role: 'knower' as const, lastSeenAt: 0 },
  b: { uid: 'b', name: 'Tomi', avatarColor: '#FF5B4A', role: 'knower' as const, lastSeenAt: 0 },
  c: { uid: 'c', name: 'Ade', avatarColor: '#2E9E6B', role: 'knower' as const, lastSeenAt: 0 },
};

export default function DevScreen() {
  const styles = useStyles(makeStyles);
  // `/dev?screen=guesser` opens a specific screen (handy for screenshots).
  const params = useLocalSearchParams<{ screen?: string }>();
  const initial = SCREENS.find((s) => s === params.screen) ?? 'knower-active';
  const [screen, setScreen] = useState<DevScreen>(initial);
  const [chain, setChain] = useState(MOCK.chain);

  // __DEV__ is false in production/release JS bundles — this screen is prototype-only
  // and must never be reachable (directly or via deep link) once shipped.
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.root}>
        {screen === 'intro' && (
          <RoundIntroScreen
            round={MOCK.round}
            isGuesser
            category={MOCK.category}
            knowerNames={['Tomi', 'Ade']}
            guesserName="Kemi"
          />
        )}
        {screen === 'knower-active' && (
          <KnowerActiveScreen
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
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
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
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
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
            category={MOCK.category}
            chain={chain}
            activeKnowerName={MOCK.activeKnowerName}
            knowerIsTyping={MOCK.knowerIsTyping}
            durationSeconds={MOCK.durationSeconds}
            secondsRemaining={MOCK.secondsRemaining}
            onGuess={async (g) => {
              console.log('Guess:', g);
              return false;
            }}
          />
        )}
        {screen === 'result' && (
          <RoundResolutionScreen
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
            outcome="won"
            targetWord={MOCK.targetWord}
            guess="lighthouse"
            guesserName="Kemi"
            isMyGuess={false}
            chain={[...chain, 'fish', 'boat']}
            linkChecks={{ [chain.length + 1]: 'invalid' }}
            results={['won', 'lost', 'won']}
            isHost={false}
            onNextRound={() => {}}
          />
        )}
        {screen === 'game-end' && (
          <GameEndScreen
            history={MOCK_HISTORY}
            players={MOCK_PLAYERS}
            maxRounds={MOCK.maxRounds}
            onPlayAgain={() => {}}
            onBackToHome={() => router.back()}
          />
        )}
      </View>

      <ScrollView horizontal style={styles.switcherScroll} contentContainerStyle={styles.switcher}>
        <Pressable style={styles.tab} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.tabText}>← Exit</Text>
        </Pressable>
        {SCREENS.map((s) => (
          <Pressable
            key={s}
            style={[styles.tab, screen === s && styles.tabActive]}
            onPress={() => setScreen(s)}
            accessibilityRole="button"
          >
            <Text style={[styles.tabText, screen === s && styles.tabTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.ground },
    switcherScroll: { flexGrow: 0, backgroundColor: p.card, borderTopWidth: 3, borderTopColor: p.line },
    switcher: { flexDirection: 'row' },
    tab: { paddingHorizontal: 14, paddingVertical: 12 },
    tabActive: { backgroundColor: p.yellow },
    tabText: { fontFamily: fonts.bold, fontSize: 13, color: p.ink },
    tabTextActive: { color: p.onYellow },
  });
