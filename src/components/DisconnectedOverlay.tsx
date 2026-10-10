import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { colors, elevation, radius, spacing, typography } from '../theme';

interface DisconnectedOverlayProps {
  playerName: string;
  secondsLeft: number;
  onEndGame: () => void;
}

/** Dims the game and gives remaining players a countdown while a player is offline. */
export function DisconnectedOverlay({
  playerName,
  secondsLeft,
  onEndGame,
}: DisconnectedOverlayProps) {
  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, elevation.modal]}>
        <Text style={styles.title}>{playerName} disconnected</Text>
        <Text style={styles.subtitle}>Waiting for them to reconnect…</Text>

        <View style={styles.countdownRing}>
          <Text style={styles.countdownText}>{secondsLeft}</Text>
        </View>

        <Pressable
          onPress={onEndGame}
          accessibilityRole="button"
          accessibilityLabel="End game now"
          style={({ pressed }) => [styles.endBtn, pressed && styles.endBtnPressed]}
        >
          <Text style={styles.endBtnText}>End Game Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(27, 28, 21, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.containerMargin,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    padding: spacing.stackLg,
    alignItems: 'center',
    gap: spacing.stackMd,
  },
  title: {
    ...typography.headlineLgMobile,
    color: colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  countdownRing: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    ...typography.headlineLg,
    fontFamily: 'Rubik_700Bold',
    color: colors.error,
  },
  endBtn: {
    width: '100%',
    height: 56,
    backgroundColor: colors.error,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.stackSm,
  },
  endBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  endBtnText: {
    ...typography.labelXl,
    fontFamily: 'Rubik_700Bold',
    color: colors.onError,
  },
});
