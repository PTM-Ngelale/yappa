import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, spacing, typography } from '../theme';

interface SyncErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}

/**
 * Non-blocking top banner for a failed realtime write (submit, resolve, advance, etc).
 * The game stays visible and interactive underneath — this only surfaces that something
 * didn't reach the server, it never blocks play the way a full-screen error state would.
 */
export function SyncErrorBanner({ message, onRetry, onDismiss }: SyncErrorBannerProps) {
  return (
    <View style={[styles.banner, elevation.card]} accessibilityLiveRegion="assertive">
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.errorContainer,
    paddingHorizontal: spacing.containerMargin,
    paddingVertical: spacing.stackSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.stackMd,
  },
  message: {
    ...typography.bodyMd,
    color: colors.onErrorContainer,
    flex: 1,
  },
  actions: { flexDirection: 'row', gap: spacing.stackMd },
  retryText: {
    ...typography.labelXl,
    fontFamily: 'Rubik_700Bold',
    fontSize: 13,
    color: colors.onErrorContainer,
  },
  dismissText: {
    ...typography.bodyMd,
    fontSize: 13,
    color: colors.onErrorContainer,
    opacity: 0.7,
  },
});
