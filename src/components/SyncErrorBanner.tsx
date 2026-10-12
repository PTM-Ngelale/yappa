import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, type, useStyles, useTheme, type Palette } from '../theme';
import { Pressable } from './Pressable';
import { Sticker } from './ui';

interface SyncErrorBannerProps {
  message: string;
  /** Left out when retrying can't help (e.g. the server rejected the word). */
  onRetry?: () => void;
  onDismiss: () => void;
}

/**
 * Floating card for a failed realtime write (submit, resolve, advance…) — tells the player
 * instead of leaving their screen silently stuck, and lets them retry.
 */
export function SyncErrorBanner({ message, onRetry, onDismiss }: SyncErrorBannerProps) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} accessibilityLiveRegion="assertive">
      <Sticker shadow={p.coral} radius={18} contentStyle={styles.banner}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {onRetry && (
            <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry" hitSlop={8}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          )}
          <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8}>
            <Text style={styles.dismiss}>Dismiss</Text>
          </Pressable>
        </View>
      </Sticker>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, zIndex: 10 },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
    message: { ...type.small, fontFamily: fonts.bold, color: p.ink, flex: 1 },
    actions: { flexDirection: 'row', gap: 14 },
    retry: { fontFamily: fonts.black, fontSize: 15, color: p.danger },
    dismiss: { fontFamily: fonts.bold, fontSize: 15, color: p.muted },
  });
