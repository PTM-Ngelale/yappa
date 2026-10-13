import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, OUTLINE, Screen, ScreenBody, Sticker, useShortScreen } from '../components/ui';
import { fonts, type, useStyles, useTheme, type Palette } from '../theme';

/** How long the role reveal stays up before the round starts. */
export const ROUND_INTRO_MS = 2500;

interface RoundIntroScreenProps {
  round: number;
  isGuesser: boolean;
  category: string;
  /** The two Knowers' names (shown to the Guesser), or [partner] (shown to a Knower). */
  knowerNames: string[];
  guesserName: string;
}

/** Full-screen role reveal between rounds: round number, your role, the category. */
export function RoundIntroScreen({ round, isGuesser, category, knowerNames, guesserName }: RoundIntroScreenProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const short = useShortScreen();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: ROUND_INTRO_MS, useNativeDriver: false }).start();
  }, [round, progress]);

  const role = isGuesser ? 'Guesser' : 'Knower';
  const blurb = isGuesser
    ? `${knowerNames.join(' and ')} know the word. Watch their chain and call it.`
    : `You and ${knowerNames[0] ?? 'your partner'} know the word. Lead ${guesserName} to it.`;

  return (
    <Screen ground={p.coral}>
      <View pointerEvents="none" style={[styles.blobA, { backgroundColor: p.blue }]} />
      <View pointerEvents="none" style={[styles.blobB, { backgroundColor: p.yellow }]} />

      <ScreenBody style={[styles.body, short && styles.bodyCompact]}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Sticker radius={22} offset={6} style={styles.roundWrap} contentStyle={styles.round}>
            <Text style={[styles.roundText, short && styles.roundCompact]}>Round {round}</Text>
          </Sticker>

          <View style={styles.roleBlock}>
            <Eyebrow style={{ color: p.onCoral, fontSize: 14 }}>
              {isGuesser ? 'This round you’re the' : 'This round you’re a'}
            </Eyebrow>
            <Text style={[styles.role, short && styles.roleCompact]} accessibilityRole="header">
              {role}
            </Text>
          </View>

          <Sticker bg={p.hero} shadow={p.yellow} radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
            <Eyebrow style={{ color: p.heroAccent }}>Category</Eyebrow>
            <Text style={styles.category}>{category}</Text>
            <Text style={styles.blurb}>{blurb}</Text>
          </Sticker>

          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View
              style={[
                styles.fill,
                { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>
      </ScreenBody>
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
