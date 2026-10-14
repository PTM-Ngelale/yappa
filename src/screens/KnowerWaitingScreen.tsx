import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DescriptionFeed } from '../components/DescriptionFeed';
import { GameHeader, Prompt, SecretWordCard, TipCard, type WordMeaning } from '../components/game';
import { TurnClock } from '../components/TurnClock';
import { TypingIndicator } from '../components/TypingIndicator';
import { Avatar, Eyebrow, OUTLINE, Screen, ScreenBody, Sticker, useShortScreen } from '../components/ui';
import { ROUND_SECONDS } from '../game/config';
import type { FeedEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../theme';

interface KnowerWaitingScreenProps {
  round: number;
  maxRounds: number;
  targetWord: string;
  /** What the secret word means: tapping the card shows it. */
  meaning?: WordMeaning;
  /** What's happening right now: your turn, a wrong guess to steer from, a turn that ran out. */
  prompt?: { text: string; tone: 'calm' | 'alert' };
  /** This round's first-game tip, if any. */
  tip?: { text: string; onDismiss: () => void };
  category: string;
  feed: FeedEntry[];
  players: Record<string, RoomPlayer>;
  partnerName: string;
  partnerColor?: string;
  /** True while partner is actively typing (after their turn starts) */
  partnerIsTyping: boolean;
  /** The partner's turn clock. */
  turnSeconds: number;
  /** The round's clock. */
  roundSeconds: number;
  /** Hide the round timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
}

export function KnowerWaitingScreen({
  round,
  maxRounds,
  targetWord,
  meaning,
  prompt,
  tip,
  category,
  feed,
  players,
  partnerName,
  partnerColor,
  partnerIsTyping,
  turnSeconds,
  roundSeconds,
  showTimer = true,
}: KnowerWaitingScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();

  return (
    <Screen>
      <ScreenBody style={styles.body}>
        <GameHeader
          round={round}
          maxRounds={maxRounds}
          role={`${partnerName}’s turn`}
          durationSeconds={ROUND_SECONDS}
          secondsRemaining={roundSeconds}
          showTimer={showTimer}
          compact={short}
        />

        <SecretWordCard word={targetWord} category={category} meaning={meaning} compact={short} />
        {tip && !short && <TipCard text={tip.text} onDismiss={tip.onDismiss} />}

        <View style={[styles.feedSection, short && styles.feedSectionShort]}>
          {!short && <Eyebrow>The description</Eyebrow>}
          <DescriptionFeed
            entries={feed}
            players={players}
            emptyLabel={`${partnerName} goes first…`}
            style={styles.flex}
          />
        </View>

        {prompt && <Prompt text={prompt.text} tone={prompt.tone} />}
        <View accessibilityLiveRegion="polite">
          <Sticker contentStyle={styles.partnerCard}>
            <Avatar name={partnerName} color={partnerColor ?? p.coral} />
            <View style={styles.flex}>
              <Text style={styles.partnerTitle}>{partnerName} is adding a word...</Text>
              <Text style={styles.partnerSub}>You’re up next</Text>
            </View>
            <TypingIndicator active={partnerIsTyping} />
          </Sticker>
        </View>
      </ScreenBody>

      {/* Locked input: same spot as on the active screen, so nothing jumps when the turn passes */}
      <View style={styles.inputSection}>
        <TurnClock label={`${partnerName}’s turn`} seconds={turnSeconds} urgent={false} />
        <View style={styles.inputRow}>
          <TextInput
            editable={false}
            placeholder="Wait for your turn"
            placeholderTextColor={p.onDisabled}
            style={styles.input}
            accessibilityLabel="Your word: locked until your turn"
            accessibilityState={{ disabled: true }}
          />
          <View style={styles.send} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Feather name="arrow-right" size={26} color={p.onDisabled} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    body: { paddingHorizontal: spacing.screen, paddingTop: 10, gap: 16 },
    feedSection: { flex: 1, gap: 10, minHeight: 110 },
    // Short screens: a fixed height, so the feed scrolls itself to the newest words (inside
    // the screen's own scroll view a stretchy area would just grow to fit them all).
    // (flexBasis 'auto': on the web a 0 basis would override the height.)
    feedSectionShort: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, height: 92 },
    partnerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    partnerTitle: { fontFamily: fonts.black, fontSize: 18, color: p.ink },
    partnerSub: { ...type.small, color: p.ink },
    inputSection: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 16, gap: 8 },
    inputRow: { flexDirection: 'row', gap: 10 },
    input: {
      flex: 1,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.disabled,
      paddingHorizontal: 18,
      fontFamily: fonts.bold,
      fontSize: 20,
      color: p.onDisabled,
    },
    send: {
      width: 60,
      height: 60,
      borderRadius: radius.md + 2,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.disabled,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
