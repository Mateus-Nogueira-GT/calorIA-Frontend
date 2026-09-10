import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, DimensionValue, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius as radiusTokens } from '@theme';

interface Props {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
  testID?: string;
}

export function Skeleton({ width = '100%', height = 12, radius = radiusTokens.pill, style, testID }: Props): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.72)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.72, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  return (
    <Animated.View
      testID={testID}
      style={[styles.base, { width, height, borderRadius: radius, opacity: anim }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.brandTrack },
});
