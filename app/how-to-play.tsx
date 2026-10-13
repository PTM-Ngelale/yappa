import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DescriptionFeed } from '../src/components/DescriptionFeed';
import { PoweredBy } from '../src/components/PoweredBy';
import { Eyebrow, IconButton, OUTLINE, Pill, Screen, Sticker } from '../src/components/ui';
import { ROUND_SECONDS, TURN_SECONDS } from '../src/game/config';
import type { FeedEntry } from '../src/supabase/room';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../src/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

// The spec's lighthouse example: Tomi (coral) and Ade (green) describe, Kemi guesses.
const EXAMPLE_PLAYERS = {
  k: { uid: 'k', name: 'Kemi', avatarColor: '#3B5BFF', role: 'guesser' as const, lastSeenAt: 0 },
  t: { uid: 't', name: 'Tomi', avatarColor: '#FF5B4A', role: 'knower' as const, lastSeenAt: 0 },
  a: { uid: 'a', name: 'Ade', avatarColor: '#2E9E6B', role: 'knower' as const, lastSeenAt: 0 },
};
const EXAMPLE_FEED: FeedEntry[] = [
  { kind: 'word', text: 'Tall', by: 't' },
  { kind: 'word', text: 'thing', by: 'a' },
  { kind: 'word', text: 'near', by: 't' },
  { kind: 'word', text: 'rocks', by: 'a' },
  { kind: 'guess', text: 'cliff', by: 'k', correct: false },
  { kind: 'word', text: 'no', by: 't' },
  { kind: 'word', text: 'it', by: 'a' },
  { kind: 'word', text: 'spins', by: 't' },
  { kind: 'guess', text: 'lighthouse', by: 'k', correct: true },
];

export default function HowToPlayScreen() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <IconButton icon="arrow-left" onPress={() => router.back()} accessibilityLabel="Back" />
        </View>
        <Text style={styles.headerTitle} accessibilityRole="header">
          How to play
        </Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.tagline}>
          Two of you describe a secret word, one word at a time. The third guesses it before time runs out.
        </Text>

        <Section title="How it works">
          <Step number={1} label="Each round:" text="one Guesser, two Knowers. Everyone takes turns." />
          <Step number={2} label="Knowers:" text={`take turns adding one word each. You get ${TURN_SECONDS} seconds per word.`} />
          <Step number={3} label="Guessers:" text={`guess as often as you like. Get it within ${ROUND_SECONDS} seconds to win the round.`} />
          <Text style={styles.bodyText}>9 rounds. Everyone guesses 3 times. How many can you win?</Text>
        </Section>

        <Section title="See it in action">
          <Text style={styles.bodyText}>
            Secret word: <Text style={styles.strong}>Lighthouse</Text>
          </Text>
          <DescriptionFeed entries={EXAMPLE_FEED} players={EXAMPLE_PLAYERS} variant="recap" />
          <Text style={styles.caption}>
            Tomi and Ade take turns adding a word. Kemi guesses “cliff”, they steer with “no”, and
            Kemi gets it!
          </Text>
        </Section>

        <Section title="The roles">
          <RoleRow
            icon="eye"
            colour={p.blue}
            title="Knowers (2 players)"
            body="See the secret word. Describe it together, one word each. You can’t say the word itself."
          />
          <RoleRow
            icon="search"
            colour={p.coral}
            title="Guesser (1 player)"
            body="Doesn’t see the secret word. Watches the description form and guesses as often as they like."
          />
        </Section>

        <Section title="Categories">
          <View style={styles.categories}>
            {['Objects', 'Animals', 'Places', 'Food & Drink', 'Sports'].map((c) => (
              <Pill key={c} label={c} size={14} />
            ))}
          </View>
        </Section>

        <PoweredBy />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <Sticker radius={22} contentStyle={styles.section}>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </Sticker>
  );
}

function RoleRow({ icon, colour, title, body }: { icon: IconName; colour: string; title: string; body: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.roleRow}>
      <View style={[styles.roleIcon, { backgroundColor: colour }]}>
        <Feather name={icon} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </View>
  );
}

function Step({ number, label, text }: { number: number; label?: string; text: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={[styles.bodyText, styles.flex]}>
        {label ? <Text style={styles.strong}>{label} </Text> : null}
        {text}
      </Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screen,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerSide: { width: 52 },
    headerTitle: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    body: { paddingHorizontal: spacing.screen, paddingTop: 14, paddingBottom: 32, gap: 16 },
    tagline: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, color: p.ink },
    section: { padding: 16, gap: 12 },
    bodyText: { ...type.body, color: p.ink },
    strong: { fontFamily: fonts.black },
    caption: { ...type.small, color: p.muted },
    roleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    roleIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: OUTLINE,
      borderColor: p.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roleTitle: { fontFamily: fonts.black, fontSize: 17, color: p.ink, marginBottom: 2 },
    stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    stepBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.yellow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBadgeText: { fontFamily: fonts.black, fontSize: 14, color: p.onYellow },
    categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
