import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, type, useStyles, useTheme, type Palette } from '../theme';
import { OUTLINE, Sticker, StickerButton } from './ui';

interface DisconnectedOverlayProps {
  playerName: string;
  secondsLeft: number;
  onEndGame: () => void;
}

/** Dims the game while a player is away, counting down to the game ending. */
export function DisconnectedOverlay({ playerName, secondsLeft, onEndGame }: DisconnectedOverlayProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <Sticker shadow={p.coral} radius={28} offset={7} style={styles.cardWrap} contentStyle={styles.card}>
        <View style={styles.icon}>
          <Feather name="wifi-off" size={30} color={p.onYellow} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {playerName} dropped out
        </Text>
        <Text style={styles.body}>
          The clock is paused while they reconnect. If they’re not back in time, the game ends.
        </Text>
        <View style={styles.countdown} accessibilityLiveRegion="polite">
          <Text style={styles.seconds}>{secondsLeft}</Text>
          <Text style={styles.secondsLabel}>seconds left</Text>
        </View>
        <StickerButton label="End game now" variant="card" height={56} fontSize={19} onPress={onEndGame} style={styles.button} />
      </Sticker>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: p.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    cardWrap: { alignSelf: 'stretch' },
    card: { alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      borderWidth: OUTLINE,
      borderColor: p.line,
      backgroundColor: p.yellow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontFamily: fonts.black, fontSize: 28, color: p.ink, textAlign: 'center' },
    body: { ...type.body, color: p.ink, textAlign: 'center' },
    countdown: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    seconds: { fontFamily: fonts.black, fontSize: 56, lineHeight: 62, letterSpacing: -2, color: p.ink },
    secondsLabel: { fontFamily: fonts.bold, fontSize: 18, color: p.ink },
    button: { alignSelf: 'stretch' },
  });
