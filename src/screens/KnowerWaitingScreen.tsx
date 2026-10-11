import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { GameHeader, SecretWordCard } from '../components/game';
import { TypingIndicator } from '../components/TypingIndicator';
import { Avatar, Eyebrow, OUTLINE, Screen, Sticker } from '../components/ui';
import { WordChain } from '../components/WordChain';
import { fonts, radius, spacing, type, useStyles, useTheme, type Palette } from '../theme';

interface KnowerWaitingScreenProps {
  round: number;
  maxRounds: number;
  targetWord: string;
  category: string;
  chain: string[];
  partnerName: string;
  partnerColor?: string;
  /** True while partner is actively typing (after their turn starts) */
  partnerIsTyping: boolean;
  durationSeconds: number;
  secondsRemaining: number;
  /** Hide the timer bar entirely rather than show a frozen/misleading one. */
  showTimer?: boolean;
}

export function KnowerWaitingScreen({
  round,
  maxRounds,
  targetWord,
  category,
  chain,
  partnerName,
  partnerColor,
  partnerIsTyping,
  durationSeconds,
  secondsRemaining,
  showTimer = true,
}: KnowerWaitingScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();

  return (
    <Screen>
      <View style={styles.body}>
        <GameHeader
          round={round}
          maxRounds={maxRounds}
          role={`${partnerName}’s turn`}
          durationSeconds={durationSeconds}
          secondsRemaining={secondsRemaining}
          showTimer={showTimer}
        />

        <SecretWordCard word={targetWord} category={category} />

        <View style={styles.chainSection}>
          <Eyebrow>The chain</Eyebrow>
          <WordChain
            words={chain}
            variant="stack"
            emphasiseLast
            showPending={chain.length === 0}
            pendingLabel={`${partnerName} goes first…`}
            style={styles.flex}
          />
        </View>

        <View accessibilityLiveRegion="polite">
          <Sticker contentStyle={styles.partnerCard}>
            <Avatar name={partnerName} color={partnerColor ?? p.coral} />
            <View style={styles.flex}>
              <Text style={styles.partnerTitle}>
                {partnerIsTyping ? `${partnerName} is typing` : `${partnerName} is thinking`}
              </Text>
              <Text style={styles.partnerSub}>You’re up after their word</Text>
            </View>
            <TypingIndicator active={partnerIsTyping} />
          </Sticker>
        </View>
      </View>

      {/* Locked input — same spot as on the active screen, so nothing jumps when the turn passes */}
      <View style={styles.inputSection}>
        <Eyebrow style={{ color: p.muted }}>Your word</Eyebrow>
        <View style={styles.inputRow}>
          <TextInput
            editable={false}
            placeholder="Wait for your turn"
            placeholderTextColor={p.onDisabled}
            style={styles.input}
            accessibilityLabel="Your word — locked until your turn"
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
    body: { flex: 1, paddingHorizontal: spacing.screen, paddingTop: 10, gap: 16 },
    chainSection: { flex: 1, gap: 10, minHeight: 0 },
    partnerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
    partnerTitle: { fontFamily: fonts.black, fontSize: 18, color: p.ink },
    partnerSub: { ...type.small, color: p.ink },
    inputSection: { paddingHorizontal: spacing.screen, paddingTop: 12, paddingBottom: 16, gap: 6 },
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
