import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { IconButton } from './ui';

/** Music + sound-effects mute buttons. Choices persist across launches. */
export function SoundToggles() {
  const { musicOn, sfxOn, toggleMusic, toggleSfx } = useSettingsStore();

  return (
    <View style={styles.row}>
      <IconButton
        icon="music"
        muted={!musicOn}
        onPress={toggleMusic}
        accessibilityRole="switch"
        checked={musicOn}
        accessibilityLabel="Background music"
      />
      <IconButton
        icon={sfxOn ? 'volume-2' : 'volume-x'}
        muted={!sfxOn}
        onPress={toggleSfx}
        accessibilityRole="switch"
        checked={sfxOn}
        accessibilityLabel="Sound effects"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
});
