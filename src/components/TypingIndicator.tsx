import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useStyles, type Palette } from '../theme';

interface TypingIndicatorProps {
  /** False renders static, dimmed dots instead of the pulsing animation (e.g. partner is idle, not typing) */
  active?: boolean;
}

export function TypingIndicator({ active = true }: TypingIndicatorProps) {
  const styles = useStyles(makeStyles);
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    if (!active) {
      dots.forEach(d => d.stopAnimation());
      Animated.parallel(
        dots.map(d => Animated.timing(d, { toValue: 0.3, duration: 200, useNativeDriver: true }))
      ).start();
      return;
    }

    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.delay(560 - i * 160),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [active]);

  return (
    <View
      style={styles.row}
      accessibilityLabel={active ? 'Typing' : 'Idle'}
      accessibilityLiveRegion="polite"
    >
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              // Never fully invisible — the dots read as "someone's here" even between pulses.
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: p.ink,
    },
  });
