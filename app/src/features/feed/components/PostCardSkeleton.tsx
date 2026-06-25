import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@theme';

export function PostCardSkeleton(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.72, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatar} />
        <View style={styles.titleBlock} />
      </View>
      <View style={styles.line} />
      <View style={styles.lineShort} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTrack },
  titleBlock: { height: 14, width: 120, backgroundColor: colors.brandTrack, borderRadius: 999 },
  line: { height: 12, width: '92%', backgroundColor: colors.brandTrack, borderRadius: 999, marginBottom: 10 },
  lineShort: { height: 12, width: '60%', backgroundColor: colors.brandTrack, borderRadius: 999 },
});
