import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';

export function usePressScale(pressedScale = 0.96) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toValue: number) =>
      Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 0 }).start(),
    [scale],
  );

  const onPressIn = useCallback(() => animateTo(pressedScale), [animateTo, pressedScale]);
  const onPressOut = useCallback(() => animateTo(1), [animateTo]);

  return { scale, onPressIn, onPressOut };
}
