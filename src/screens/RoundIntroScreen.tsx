import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { categoryLabel } from '../game/categories';
import { ROUND_SECONDS } from '../game/config';
import { Pressable } from '../components/Pressable';
import { Eyebrow, OUTLINE, Screen, ScreenBody, Sticker, useShortScreen } from '../components/ui';
import { fonts, type, useStyles, useTheme, type Palette } from '../theme';

/** How long the role card stays up before the round starts (the server's clocks allow for it). */
export const ROUND_INTRO_MS = 2500;

interface RoundIntroScreenProps {
  round: number;
  isGuesser: boolean;
  category: string;
  /** The two Knowers' names (shown to the Guesser), or [partner] (shown to a Knower). */
  knowerNames: string[];
  /** The secret word, for a Knower; null while it loads (and always for the Guesser). */
  targetWord: string | null;
  /** Tapping the card puts it away early. */
  onDismiss: () => void;
}

/** The role card at the start of each round: your role and what to do (GAMEPLAY_REDESIGN.md, section 8). */
export function RoundIntroScreen({ round, isGuesser, category, knowerNames, targetWord, onDismiss }: RoundIntroScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: ROUND_INTRO_MS, useNativeDriver: false }).start();
  }, [round, progress]);

  const role = isGuesser ? 'Guesser 🔍' : 'Knower 🤫';

  return (
    <Screen ground={p.coral}>
      <View pointerEvents="none" style={[styles.blobA, { backgroundColor: p.blue }]} />
      <View pointerEvents="none" style={[styles.blobB, { backgroundColor: p.yellow }]} />

      <Pressable
        onPress={onDismiss}
        style={styles.flex}
        accessibilityRole="button"
        accessibilityHint="Starts the round"
        sound={false}
      >
      <ScreenBody style={[styles.body, short && styles.bodyCompact]}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Sticker radius={22} offset={6} style={styles.roundWrap} contentStyle={styles.round}>
            <Text style={[styles.roundText, short && styles.roundCompact]}>Round {round}</Text>
          </Sticker>

          <View style={styles.roleBlock}>
            <Eyebrow style={{ color: p.onCoral, fontSize: 14 }}>
              {isGuesser ? 'You’re the' : 'You’re a'}
            </Eyebrow>
            <Text style={[styles.role, short && styles.roleCompact]} accessibilityRole="header">
              {role}
            </Text>
          </View>

          <Sticker bg={p.hero} shadow={p.yellow} radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
            {isGuesser ? (
              <>
                <Text style={styles.blurb}>
                  {knowerNames.join(' and ')} are describing a secret word, one word at a time.
                </Text>
                <Eyebrow style={{ color: p.heroAccent }}>Category</Eyebrow>
                <Text style={styles.category}>{categoryLabel(category)}</Text>
                <Text style={styles.blurb}>Shout out guesses anytime. Get it in {ROUND_SECONDS} seconds!</Text>
              </>
            ) : (
              <>
                <Eyebrow style={{ color: p.heroAccent }}>The word is</Eyebrow>
                <Text style={styles.category} adjustsFontSizeToFit numberOfLines={1}>
                  {targetWord ?? '…'}
                </Text>
                <Text style={styles.blurb}>
                  Take turns with {knowerNames[0] ?? 'your partner'} adding one word each to describe it.
                </Text>
                <Text style={styles.blurbSmall}>Stuck? Tap the word to see what it means.</Text>
              </>
            )}
          </Sticker>

          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View
              style={[
                styles.fill,
                { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
          <Text style={styles.tapHint}>Tap to start</Text>
        </View>
      </ScreenBody>
      </Pressable>
    </Screen>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    blobA: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 30,
      borderWidth: OUTLINE,
      borderColor: p.line,
      top: 60,
      right: -46,
      transform: [{ rotate: '-14deg' }],
    },
    blobB: {
      position: 'absolute',
      width: 300,
      height: 300,
      borderRadius: 150,
      borderWidth: OUTLINE,
      borderColor: p.line,
      bottom: -150,
      left: -110,
    },
    body: { justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 16 },
    bodyCompact: { paddingVertical: 10 },
    content: { alignItems: 'center', gap: 26 },
    roundCompact: { fontSize: 38, lineHeight: 46 },
    roleCompact: { fontSize: 46, lineHeight: 52 },
    roundWrap: { transform: [{ rotate: '3deg' }] },
    round: { paddingHorizontal: 22, paddingVertical: 2 },
    roundText: { fontFamily: fonts.black, fontSize: 52, lineHeight: 62, letterSpacing: -2, color: p.ink },
    roleBlock: { alignItems: 'center', gap: 4 },
    role: { fontFamily: fonts.black, fontSize: 66, lineHeight: 72, letterSpacing: -2.5, color: p.onCoral },
    cardWrap: { alignSelf: 'stretch' },
    card: { padding: 18, alignItems: 'center', gap: 6 },
    category: { fontFamily: fonts.black, fontSize: 34, color: p.onHero, textAlign: 'center' },
    blurb: { ...type.body, color: p.onHero, textAlign: 'center', opacity: 0.92 },
    blurbSmall: { ...type.small, color: p.onHero, textAlign: 'center', opacity: 0.85 },
    tapHint: { fontFamily: fonts.bold, fontSize: 14, color: p.onCoral, opacity: 0.85 },
    flex: { flex: 1 },
    track: {
      width: 160,
      height: 14,
      borderRadius: 999,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.card,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: p.ink },
  });
