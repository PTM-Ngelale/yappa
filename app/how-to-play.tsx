import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { DescriptionFeed } from '../src/components/DescriptionFeed';
import { PoweredBy } from '../src/components/PoweredBy';
import { Eyebrow, IconButton, OUTLINE, Pill, Screen, Sticker, StickerButton } from '../src/components/ui';
import { categoryLabel } from '../src/game/categories';
import { DUO_CLUES, ROUND_SECONDS, TURN_SECONDS } from '../src/game/config';
import { EXAMPLE_FEED, EXAMPLE_PLAYERS } from '../src/game/demo';
import { roundsFor } from '../src/game/players';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../src/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

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
          For 2 to 5 players. The Knowers describe a secret word, one word at a time. The Guesser guesses it before time runs out.
        </Text>

        <Section title="How it works">
          <Step number={1} label="Each round:" text="one Guesser, everyone else is a Knower. Everyone takes a turn guessing." />
          <Step number={2} label="Knowers:" text={`take turns adding one word each, any word that helps. No need for sentences. You get ${TURN_SECONDS} seconds per word.`} />
          <Step number={3} label="Stuck?" text="Tap the secret word to see what it means." />
          <Step number={4} label="Guessers:" text={`guess as often as you like. Get it within ${ROUND_SECONDS} seconds to win the round.`} />
          <StickerButton
            label="Watch the demo"
            icon="play"
            variant="yellow"
            height={52}
            fontSize={18}
            onPress={() => router.push({ pathname: '/demo', params: { from: 'how-to-play' } })}
          />
          <Text style={styles.bodyText}>
            Everyone guesses the same number of times: {roundsFor(3)} rounds with 3 players, {roundsFor(4)} with 4,{' '}
            {roundsFor(5)} with 5. How many can you win?
          </Text>
          <Text style={styles.bodyText}>
            <Text style={styles.strong}>Just two of you?</Text> Play duo: you swap roles every round, for{' '}
            {roundsFor(2)} rounds. No turn clock, but only {DUO_CLUES} clues a round, so make every word count.
          </Text>
        </Section>

        <Section title="See it in action">
          <Text style={styles.bodyText}>
            Secret word: <Text style={styles.strong}>Lighthouse</Text>
          </Text>
          <DescriptionFeed entries={EXAMPLE_FEED} players={EXAMPLE_PLAYERS} variant="recap" />
          <Text style={styles.caption}>
            Tomi and Ade take turns adding a clue. Kemi guesses “cliff”, which is marked wrong, so
            they keep the clues coming until Kemi gets it!
          </Text>
        </Section>

        <Section title="The roles">
          <RoleRow
            icon="eye"
            colour={p.blue}
            title="Knowers (everyone else)"
            body="See the secret word. Take turns adding one-word clues. They don’t have to make a sentence. You can’t say the word itself."
          />
          <RoleRow
            icon="search"
            colour={p.coral}
            title="Guesser (1 player)"
            body="Doesn’t see the secret word. Watches the clues come in and guesses as often as they like."
          />
        </Section>

        <Section title="Categories">
          <View style={styles.categories}>
            {['Objects', 'Animals', 'Places', 'Food & Drink', 'Sports'].map((c) => (
              <Pill key={c} label={categoryLabel(c)} size={14} />
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
