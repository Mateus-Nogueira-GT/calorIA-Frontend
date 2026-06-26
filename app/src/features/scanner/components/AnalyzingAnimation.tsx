import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';

export function AnalyzingAnimation(): React.JSX.Element {
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.85, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.pulse, { transform: [{ scale }] }]}>
        <Text style={styles.emoji}>🍽️</Text>
      </Animated.View>
      <Text style={styles.text}>Analisando seu prato...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 48,
  },
  pulse: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.brandSupportSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 40 },
  text: {
    fontSize: 16,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
  },
});
