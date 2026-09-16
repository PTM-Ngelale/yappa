import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

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
      // This one Animated.Value drives both a transform (scaleX) and a color — color
      // interpolation can't run on the native driver here, and splitting the two onto
      // separate native/non-native driven values crashes under Fabric ("attempting to run
      // JS driven animation on animated node that has been moved to native earlier") because
      // they still feed the same Animated.View. Keeping both on one JS-driven value avoids
      // that; using scaleX instead of raw `width` still avoids the worse anti-pattern of
      // animating a layout property every frame.
      useNativeDriver: false,
    }).start();
  }, [secondsRemaining, durationSeconds]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [colors.error, colors.primary, colors.secondary],
  });

  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: durationSeconds, now: secondsRemaining }}
      accessibilityLabel={`${secondsRemaining} seconds remaining`}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor, transform: [{ scaleX: progress }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    backgroundColor: colors.surfaceContainerHigh,
    width: '100%',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: 12,
    width: '100%',
    borderRadius: radius.full,
    transformOrigin: 'left',
  },
});
