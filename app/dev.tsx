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
import type { FeedEntry, RoundHistoryEntry } from '../src/supabase/room';
import { fonts, useStyles, type Palette } from '../src/theme';
import { TIPS } from '../src/game/tips';

type DevScreen = 'intro' | 'intro-knower' | 'knower-active' | 'knower-waiting' | 'guesser' | 'result' | 'game-end';
const SCREENS: DevScreen[] = ['intro', 'intro-knower', 'knower-active', 'knower-waiting', 'guesser', 'result', 'game-end'];
const MOCK_MEANING = 'A tall tower by the sea with a bright light that warns ships.';
const MOCK_TIP = { text: TIPS['knower-1'], onDismiss: () => {} };

const MOCK = {
  round: 3,
  maxRounds: 9,
  targetWord: 'Lighthouse',
  category: 'Places',
  turnSeconds: 7,
  roundSeconds: 38,
  partnerName: 'Tomi',
  partnerIsTyping: true,
  activeKnowerName: 'Tomi',
  knowerIsTyping: true,
};

// The spec's worked example (GAMEPLAY_REDESIGN.md, section 3): Kemi guesses, Tomi and Ade describe.
const MOCK_FEED: FeedEntry[] = [
  { kind: 'word', text: 'tall', by: 'b' },
  { kind: 'word', text: 'thing', by: 'c' },
  { kind: 'word', text: 'near', by: 'b' },
  { kind: 'skip', by: 'c' },
  { kind: 'word', text: 'rocks', by: 'b' },
  { kind: 'guess', text: 'cliff', by: 'a', correct: false },
  { kind: 'word', text: 'beam', by: 'c' },
  { kind: 'word', text: 'it', by: 'b' },
  { kind: 'word', text: 'spins', by: 'c' },
];

const MOCK_HISTORY: RoundHistoryEntry[] = [
  { round: 1, category: 'Objects', targetWord: 'Backpack', chain: ['bag', 'on', 'your', 'back'], wordCount: 4, durationMs: 14000, guesserUid: 'b', outcome: 'won', guess: 'backpack' },
  { round: 2, category: 'Animals', targetWord: 'Penguin', chain: ['cold', 'bird', 'tuxedo'], wordCount: 3, durationMs: 60000, guesserUid: 'c', outcome: 'lost-timeout', guess: null },
  { round: 3, category: 'Places', targetWord: 'Lighthouse', chain: ['tall', 'thing', 'near', 'rocks', 'beam', 'warns', 'ships'], wordCount: 7, durationMs: 33000, guesserUid: 'a', outcome: 'won', guess: 'lighthouse' },
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
  const [feed, setFeed] = useState<FeedEntry[]>(MOCK_FEED);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const meaning = { text: MOCK_MEANING, open: meaningOpen, onToggle: () => setMeaningOpen((o) => !o) };

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
            targetWord={null}
            onDismiss={() => setScreen('guesser')}
          />
        )}
        {screen === 'intro-knower' && (
          <RoundIntroScreen
            round={MOCK.round}
            isGuesser={false}
            category={MOCK.category}
            knowerNames={['Tomi']}
            targetWord={MOCK.targetWord}
            onDismiss={() => setScreen('knower-active')}
          />
        )}
        {screen === 'knower-active' && (
          <KnowerActiveScreen
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
            targetWord={MOCK.targetWord}
            meaning={meaning}
            prompt={{ text: 'Not cliff! Steer them away', tone: 'alert' }}
            tip={MOCK_TIP}
            category={MOCK.category}
            feed={feed}
            players={MOCK_PLAYERS}
            turnSeconds={MOCK.turnSeconds}
            roundSeconds={MOCK.roundSeconds}
            onSubmitWord={(w) => {
              setFeed((f) => [...f, { kind: 'word', text: w, by: 'c' }]);
              setScreen('knower-waiting');
            }}
          />
        )}
        {screen === 'knower-waiting' && (
          <KnowerWaitingScreen
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
            targetWord={MOCK.targetWord}
            meaning={meaning}
            prompt={{ text: 'Too slow! Tomi’s turn', tone: 'alert' }}
            tip={MOCK_TIP}
            category={MOCK.category}
            feed={feed}
            players={MOCK_PLAYERS}
            partnerName={MOCK.partnerName}
            partnerIsTyping={MOCK.partnerIsTyping}
            turnSeconds={MOCK.turnSeconds}
            roundSeconds={MOCK.roundSeconds}
          />
        )}
        {screen === 'guesser' && (
          <GuesserScreen
            round={MOCK.round}
            maxRounds={MOCK.maxRounds}
            category={MOCK.category}
            feed={feed}
            players={MOCK_PLAYERS}
            activeKnowerName={MOCK.activeKnowerName}
            knowerIsTyping={MOCK.knowerIsTyping}
            roundSeconds={MOCK.roundSeconds}
            tip={{ text: TIPS['guesser-1'], onDismiss: () => {} }}
            onGuess={async (g) => {
              setFeed((f) => [...f, { kind: 'guess', text: g, by: 'a', correct: false }]);
              return { status: 'wrong' };
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
            feed={[...feed, { kind: 'guess', text: 'lighthouse', by: 'a', correct: true }]}
            players={MOCK_PLAYERS}
            durationMs={33000}
            wordCount={feed.filter((e) => e.kind === 'word').length}
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
            onShare={async () => 'copied'}
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
