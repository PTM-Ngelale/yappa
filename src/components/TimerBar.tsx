import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, useStyles, type Palette } from '../theme';
import { OUTLINE } from './ui';

interface TimerBarProps {
  durationSeconds: number;
  secondsRemaining: number;
}

/** Chunky outlined countdown bar with the seconds left beside it. */
export function TimerBar({ durationSeconds, secondsRemaining }: TimerBarProps) {
  const styles = useStyles(makeStyles);
  const progress = useRef(new Animated.Value(secondsRemaining / durationSeconds)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: secondsRemaining / durationSeconds,
      duration: 800,
      // scaleX with a left transform origin, rather than animating width every frame.
      // JS-driven: under Fabric this node can't be moved to the native driver mid-life.
      useNativeDriver: false,
    }).start();
  }, [secondsRemaining, durationSeconds]);

  return (
    <View style={styles.row}>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: durationSeconds, now: secondsRemaining }}
        accessibilityLabel={`${secondsRemaining} seconds remaining`}
      >
        <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      </View>
      <Text style={styles.seconds} accessibilityElementsHidden importantForAccessibility="no">
        {secondsRemaining}s
      </Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    track: {
      flex: 1,
      height: 22,
      backgroundColor: p.card,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      width: '100%',
      backgroundColor: p.coral,
      transformOrigin: 'left',
    },
    seconds: { fontFamily: fonts.black, fontSize: 22, color: p.ink, minWidth: 44, textAlign: 'right' },
  });
