import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { playSound } from '../src/audio/sounds';
import { DescriptionFeed } from '../src/components/DescriptionFeed';
import { Prompt, SecretWordCard } from '../src/components/game';
import { Pressable } from '../src/components/Pressable';
import { Avatar, Eyebrow, Screen, ScreenBody, Sticker, StickerButton } from '../src/components/ui';
import { ROUND_SECONDS, TURN_SECONDS } from '../src/game/config';
import { EXAMPLE_CATEGORY, EXAMPLE_FEED, EXAMPLE_OFF_LIMITS, EXAMPLE_PLAYERS, EXAMPLE_WORD } from '../src/game/demo';
import { useSettingsStore } from '../src/store/settingsStore';
import { fonts, spacing, useStyles, useTheme, type Palette } from '../src/theme';

// The demo (GAMEPLAY_REDESIGN.md, section 8): the lighthouse example played out, about 22
// seconds, one rule per caption. `shown` is how many feed entries are on screen from then on.
const STEPS: Array<{ at: number; shown: number; caption: string }> = [
  { at: 0, shown: 0, caption: 'Tomi and Ade see the secret word and the words they can’t say. Kemi, the Guesser, doesn’t.' },
  { at: 2600, shown: 1, caption: 'Tomi and Ade take turns adding one word each.' },
  { at: 5000, shown: 2, caption: `Each turn lasts ${TURN_SECONDS} seconds. Too slow and the turn passes.` },
  { at: 7400, shown: 3, caption: 'No sentences needed. Any word that helps Kemi counts.' },
  { at: 9800, shown: 4, caption: 'Kemi can guess at any time, as often as needed.' },
  { at: 12200, shown: 5, caption: 'Not cliff! Wrong guesses are marked for everyone.' },
  { at: 14600, shown: 6, caption: 'No need to say “no”. Tomi just adds another clue.' },
  { at: 17000, shown: 7, caption: 'Ade adds another.' },
  { at: 19400, shown: 8, caption: 'A beam that warns boats… Kemi is getting close.' },
  { at: 21800, shown: 9, caption: `Lighthouse! Guessed inside ${ROUND_SECONDS} seconds. Round won.` },
];
const DONE_AT = 21800;

export default function DemoScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  // From How to Play: go back there. On first launch: carry on to Home.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const leave = () => (from === 'how-to-play' && router.canGoBack() ? router.back() : router.replace('/'));

  const [run, setRun] = useState(0);
  const [step, setStep] = useState(0);
  const done = step === STEPS.length - 1;

  useEffect(() => {
    useSettingsStore.getState().markDemoSeen();
  }, []);

  useEffect(() => {
    setStep(0);
    const timers = STEPS.slice(1).map((s, i) =>
      setTimeout(() => {
        setStep(i + 1);
        const entry = EXAMPLE_FEED[s.shown - 1];
        if (entry?.kind === 'guess') playSound(entry.correct ? 'win' : 'error');
        else playSound('pop');
      }, s.at),
    );
    return () => timers.forEach(clearTimeout);
  }, [run]);

  const { shown, caption } = STEPS[step];
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          How Clue Line works
        </Text>
        {!done && (
          <Pressable onPress={leave} accessibilityRole="button" style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      <ScreenBody style={styles.body}>
        <View style={styles.players}>
          {['t', 'a', 'k'].map((u) => (
            <View key={u} style={styles.player}>
              <Avatar name={EXAMPLE_PLAYERS[u].name} color={EXAMPLE_PLAYERS[u].avatarColor} size={40} />
              <Text style={styles.playerName}>{EXAMPLE_PLAYERS[u].name}</Text>
              <Text style={styles.playerRole}>{u === 'k' ? 'Guesser' : 'Knower'}</Text>
            </View>
          ))}
        </View>

        <SecretWordCard word={EXAMPLE_WORD} category={EXAMPLE_CATEGORY} offLimits={EXAMPLE_OFF_LIMITS} hint="Only Tomi and Ade see this." />

        <Sticker radius={22} offset={5} style={styles.feedWrap} contentStyle={styles.feedCard}>
          <Eyebrow>The clues</Eyebrow>
          <DescriptionFeed
            key={run}
            entries={EXAMPLE_FEED.slice(0, shown)}
            players={EXAMPLE_PLAYERS}
            variant="recap"
            large
            popIn
          />
        </Sticker>

        <Prompt text={caption} />
        {done && <Celebration key={run} />}
      </ScreenBody>

      <View style={styles.footer}>
        {done ? (
          <>
            <StickerButton label={from === 'how-to-play' ? 'Back to How to Play' : 'Let’s play'} onPress={leave} />
            <StickerButton label="Watch again" variant="card" height={52} fontSize={18} onPress={() => setRun((r) => r + 1)} />
          </>
        ) : (
          <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ProgressBar key={run} ms={DONE_AT} />
          </View>
        )}
      </View>
    </Screen>
  );
}

/** A burst of confetti for the win. */
function Celebration() {
  const styles = useStyles(makeStyles);
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(burst, { toValue: 1, duration: 1400, useNativeDriver: true }).start();
  }, [burst]);
  const bits = ['🎉', '✨', '🎊', '⭐', '🎉', '✨', '🎊', '⭐'];
  return (
    <View pointerEvents="none" style={styles.celebration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bits.map((b, i) => {
        const angle = (i / bits.length) * Math.PI * 2;
        return (
          <Animated.Text
            key={i}
            style={[
              styles.confetti,
              {
                opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 140] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 110] }) },
                  { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.3, 1] }) },
                ],
              },
            ]}
          >
            {b}
          </Animated.Text>
        );
      })}
    </View>
  );
}

function ProgressBar({ ms }: { ms: number }) {
  const styles = useStyles(makeStyles);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: ms, useNativeDriver: false }).start();
  }, [progress, ms]);
  return (
    <View style={styles.track}>
      <Animated.View
        style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screen,
      paddingTop: 10,
      minHeight: 52,
    },
    title: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    skip: { paddingHorizontal: 10, paddingVertical: 8 },
    skipText: { fontFamily: fonts.bold, fontSize: 16, color: p.ink, textDecorationLine: 'underline' },
    body: { paddingHorizontal: spacing.screen, paddingTop: 8, gap: 14 },
    players: { flexDirection: 'row', justifyContent: 'space-around' },
    player: { alignItems: 'center', gap: 2 },
    playerName: { fontFamily: fonts.black, fontSize: 15, color: p.ink },
    playerRole: { fontFamily: fonts.bold, fontSize: 12, color: p.muted },
    feedWrap: {},
    feedCard: { padding: 14, gap: 10, minHeight: 130 },
    celebration: { position: 'absolute', left: 0, right: 0, top: '45%', alignItems: 'center' },
    confetti: { position: 'absolute', fontSize: 30 },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 16, gap: 10 },
    progress: { alignItems: 'center', paddingVertical: 8 },
    track: {
      width: 180,
      height: 12,
      borderRadius: 999,
      borderWidth: 2.5,
      borderColor: p.line,
      backgroundColor: p.card,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: p.ink },
  });
