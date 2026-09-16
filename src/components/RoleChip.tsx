import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface RoleChipProps {
  role: 'knower' | 'guesser';
  isYourTurn: boolean;
}

export function RoleChip({ role, isYourTurn }: RoleChipProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isYourTurn) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isYourTurn]);

  const label = role === 'knower' ? 'Knower' : 'Guesser';

  return (
    <Animated.View
      style={[styles.chip, isYourTurn ? styles.chipActive : styles.chipIdle, { transform: [{ scale }] }]}
      accessibilityLabel={isYourTurn ? `${label} — your turn` : label}
    >
      <Text style={[styles.text, isYourTurn ? styles.textActive : styles.textIdle]}>
        {label}{isYourTurn ? '  ·  Your turn' : ''}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.stackMd,
    paddingVertical: spacing.stackSm,
    borderRadius: radius.full,
  },
  chipActive: { backgroundColor: colors.primaryContainer },
  chipIdle: { backgroundColor: colors.surfaceContainerHigh },
  text: { ...typography.labelXl },
  textActive: { fontFamily: 'Rubik_700Bold', color: colors.onPrimaryContainer },
  textIdle: { color: colors.onSurfaceVariant },
});
