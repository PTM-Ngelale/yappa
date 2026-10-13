import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PoweredBy } from '../src/components/PoweredBy';
import { Eyebrow, IconButton, OUTLINE, Pill, Screen, Sticker } from '../src/components/ui';
import { WordChain } from '../src/components/WordChain';
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
          Two Knowers build a word chain. One Guesser tries to figure out where it’s headed.
        </Text>

        <Section title="The roles">
          <RoleRow
            icon="eye"
            colour={p.blue}
            title="Knowers (2 players)"
            body="See the secret word. Take turns adding one word at a time — each new word must make a compound word or common phrase with the word before it."
          />
          <RoleRow
            icon="search"
            colour={p.coral}
            title="Guesser (1 player)"
            body="Doesn’t see the secret word. Watches the chain grow and can guess at any time — but only gets one shot per round."
          />
        </Section>

        <Section title="See it in action">
          <Text style={styles.bodyText}>
            Secret word: <Text style={styles.strong}>Lighthouse</Text>
          </Text>
          <WordChain words={['sun', 'light', 'house']} variant="wrap" />
          <Text style={styles.caption}>
            sun → light (sunlight) → house (lighthouse) → the Guesser calls it!
          </Text>
        </Section>

        <Section title="How a round works">
          <Step number={1} text="Knowers take turns, one word each, with 30 seconds per turn." />
          <Step number={2} text="Knowers can’t play the secret word itself or an obvious variant." />
          <Step
            number={3}
            text="The Guesser can guess at any point — but a wrong guess loses the round straight away, so wait for a strong hunch."
          />
          <Step number={4} text="Running out of time without a correct guess also loses the round." />
        </Section>

        <Section title="Scoring">
          <Text style={styles.bodyText}>
            A game is 9 rounds. Roles rotate every round, so everyone guesses 3 times. Your score is
            how many rounds the team wins out of 9.
          </Text>
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

function Step({ number, text }: { number: number; text: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={[styles.bodyText, styles.flex]}>{text}</Text>
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
