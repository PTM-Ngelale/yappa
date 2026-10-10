import React, { forwardRef } from 'react';
import { Pressable as RNPressable, type PressableProps, type View } from 'react-native';
import { playSound, type SoundName } from '../audio/sounds';

interface Props extends PressableProps {
  /** Sound to play on press — defaults to a soft tap. Pass `false` for silence. */
  sound?: SoundName | false;
}

/** React Native's Pressable, plus a click sound. Disabled buttons never fire onPress, so stay quiet. */
export const Pressable = forwardRef<View, Props>(function Pressable({ sound = 'tap', onPress, ...rest }, ref) {
  return (
    <RNPressable
      ref={ref}
      {...rest}
      onPress={
        onPress
          ? (e) => {
              if (sound) playSound(sound);
              onPress(e);
            }
          : undefined
      }
    />
  );
});
