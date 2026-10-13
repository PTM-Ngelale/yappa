import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { DescriptionFeed } from '../components/DescriptionFeed';
import { GameHeader, SecretWordCard } from '../components/game';
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
        />

        <SecretWordCard word={targetWord} category={category} compact={short} />

        <View style={styles.feedSection}>
          {!short && <Eyebrow>The description</Eyebrow>}
          <DescriptionFeed
            entries={feed}
            players={players}
            emptyLabel={`${partnerName} goes first…`}
            style={styles.flex}
          />
        </View>

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
