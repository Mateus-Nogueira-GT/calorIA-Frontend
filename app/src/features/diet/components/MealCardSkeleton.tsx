import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { colors } from '@theme';

export function MealCardSkeleton(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.72)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => subscription?.remove?.();
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
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock} />
        <View style={styles.timeBlock} />
      </View>
      <View style={styles.chipsRow}>
        <View style={styles.chip} />
        <View style={styles.chip} />
        <View style={styles.chipWide} />
      </View>
      <View style={styles.itemLine} />
      <View style={styles.itemLineShort} />
      <View style={styles.buttonBlock} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  titleBlock: { height: 16, flex: 1, backgroundColor: colors.brandTrack, borderRadius: 999 },
  timeBlock: { height: 14, width: 64, backgroundColor: colors.brandTrack, borderRadius: 999 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: { height: 24, width: 56, backgroundColor: colors.brandTrack, borderRadius: 999 },
  chipWide: { height: 24, width: 78, backgroundColor: colors.brandTrack, borderRadius: 999 },
  itemLine: { height: 12, width: '92%', backgroundColor: colors.brandTrack, borderRadius: 999, marginBottom: 10 },
  itemLineShort: { height: 12, width: '68%', backgroundColor: colors.brandTrack, borderRadius: 999, marginBottom: 14 },
  buttonBlock: { height: 40, width: '100%', backgroundColor: colors.brandTrack, borderRadius: 12 },
});
