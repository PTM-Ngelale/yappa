import { useRef } from 'react';
import { Animated } from 'react-native';

/**
 * A short left-right shake used to reject invalid input inline (e.g. submitting the target
 * word, or an empty guess) without a modal or blocking dialog. Apply `shakeAnim` to a view's
 * `transform: [{ translateX: shakeAnim }]` and call `shake()` on the rejected action.
 */
export function useShakeAnimation() {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  return { shakeAnim, shake };
}
