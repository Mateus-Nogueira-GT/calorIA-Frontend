import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@theme';

export function MealCardSkeleton(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.line} />
      <View style={[styles.line, styles.short]} />
      <View style={styles.chips} />
      <View style={[styles.line, styles.long]} />
      <View style={[styles.line, styles.long]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  line: { height: 12, backgroundColor: colors.border, borderRadius: 6, marginBottom: 8 },
  short: { width: '40%' },
  long: { width: '80%' },
  chips: { height: 18, backgroundColor: colors.border, borderRadius: 8, width: '60%', marginBottom: 10 },
});
