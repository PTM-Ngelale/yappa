import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { colors, radius } from '../theme';
import { Pressable } from './Pressable';

/** Compact music + sound-effects mute buttons. Choices persist across launches. */
export function SoundToggles() {
  const { musicOn, sfxOn, toggleMusic, toggleSfx } = useSettingsStore();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggleMusic}
        accessibilityRole="switch"
        accessibilityState={{ checked: musicOn }}
        accessibilityLabel="Background music"
        hitSlop={6}
        style={({ pressed }) => [styles.btn, !musicOn && styles.btnOff, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={musicOn ? 'music' : 'music-off'}
          size={18}
          color={musicOn ? colors.primary : colors.onSurfaceVariant}
        />
      </Pressable>
      <Pressable
        onPress={toggleSfx}
        accessibilityRole="switch"
        accessibilityState={{ checked: sfxOn }}
        accessibilityLabel="Sound effects"
        hitSlop={6}
        style={({ pressed }) => [styles.btn, !sfxOn && styles.btnOff, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons
          name={sfxOn ? 'volume-high' : 'volume-off'}
          size={18}
          color={sfxOn ? colors.primary : colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  btn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryContainer,
  },
  btnOff: { backgroundColor: colors.surfaceContainerHigh },
  pressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
});
