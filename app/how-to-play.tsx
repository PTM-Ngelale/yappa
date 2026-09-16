import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WordChain } from '../src/components/WordChain';
import { colors, elevation, radius, spacing, typography } from '../src/theme';

export default function HowToPlayScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>How to Play</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.tagline}>
          Two Knowers build a word chain. One Guesser tries to figure out
          where it's headed.
        </Text>

        <Section title="The Roles">
          <RoleRow
            icon="eye"
            title="Knowers (2 players)"
            body="See the secret target word. Take turns adding one word at a time to a growing chain — each new word must form a compound word or common phrase with the word before it."
          />
          <RoleRow
            icon="search"
            title="Guesser (1 player)"
            body="Doesn't see the target. Watches the chain build and can lock in a guess at any time — but only gets one shot per round."
          />
        </Section>

        <Section title="See It In Action">
          <Text style={styles.exampleIntro}>
            Target word: <Text style={styles.exampleTarget}>LIGHTHOUSE</Text>
          </Text>
          <WordChain
            words={['Sun', 'Light', 'House']}
            emphasiseLast={false}
            style={styles.exampleChain}
          />
          <Text style={styles.exampleCaption}>
            sun → light (sunlight) → house (lighthouse) → the Guesser calls it!
          </Text>
        </Section>

        <Section title="How a Round Works">
          <Step number={1} text="Knowers alternate, one word per turn." />
          <Step
            number={2}
            text="Knowers can't submit the target word itself or an obvious variant."
          />
          <Step
            number={3}
            text="The Guesser can guess at any point — but a wrong guess ends the round as a loss immediately, so it's worth waiting for a strong hunch."
          />
          <Step
            number={4}
            text="Running out of time without a correct guess also loses the round."
          />
        </Section>

        <Section title="Scoring">
          <Text style={styles.bodyText}>
            A full game is 9 rounds. Roles rotate every round so everyone
            guesses 3 times. Your final score is how many rounds your team
            won out of 9.
          </Text>
        </Section>

        <Section title="Categories">
          <View style={styles.categoryRow}>
            {['Objects', 'Animals', 'Places', 'Food & Drink', 'Sports'].map(
              (c) => (
                <View key={c} style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{c}</Text>
                </View>
              )
            )}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RoleRow({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.roleRow}>
      <View style={styles.roleIconWrap}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.roleTextCol}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </View>
  );
}

function Step({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.containerMargin,
    height: 64,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.headlineLgMobile, color: colors.primary },
  backBtn: { minWidth: 64 },
  backText: { ...typography.bodyMd, color: colors.primary },
  body: {
    padding: spacing.containerMargin,
    paddingBottom: spacing.stackLg,
    gap: spacing.stackLg,
  },
  tagline: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  section: { gap: spacing.stackMd },
  sectionTitle: {
    ...typography.labelXl,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    letterSpacing: 1.5,
  },
  bodyText: {
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.stackMd,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.stackMd,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    ...elevation.card,
  },
  roleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roleTextCol: { flex: 1, gap: 4 },
  roleTitle: {
    ...typography.labelXl,
    fontSize: 16,
    color: colors.onSurface,
  },
  exampleIntro: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  exampleTarget: {
    fontFamily: 'Rubik_700Bold',
    color: colors.primary,
    letterSpacing: 2,
  },
  exampleChain: { minHeight: 110 },
  exampleCaption: {
    ...typography.bodyMd,
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.stackMd,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  stepBadgeText: {
    ...typography.labelXl,
    fontFamily: 'Rubik_700Bold',
    fontSize: 13,
    color: colors.onPrimaryContainer,
  },
  stepText: { ...typography.bodyMd, color: colors.onSurface, flex: 1 },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.stackSm,
  },
  categoryPill: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    borderRadius: radius.full,
  },
  categoryPillText: { ...typography.bodyMd, color: colors.onSurface },
});
