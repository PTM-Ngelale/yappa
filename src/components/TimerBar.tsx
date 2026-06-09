import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface TimerBarProps {
  durationSeconds: number;
  secondsRemaining: number;
}

export function TimerBar({ durationSeconds, secondsRemaining }: TimerBarProps) {
  const progress = useRef(new Animated.Value(secondsRemaining / durationSeconds)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: secondsRemaining / durationSeconds,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [secondsRemaining, durationSeconds]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [colors.error, colors.primary, colors.secondary],
  });

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: durationSeconds, now: secondsRemaining }}
      accessibilityLabel={`${secondsRemaining} seconds remaining`}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    backgroundColor: colors.surfaceContainerHigh,
    width: '100%',
    borderRadius: 9999,
    overflow: 'hidden',
  },
  fill: {
    height: 12,
    borderRadius: 9999,
  },
});
