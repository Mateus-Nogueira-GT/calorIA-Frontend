import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, EmitterSubscription, StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import { CoachMark } from './CoachMark';

function Dot({ delay }: { delay: number }): React.JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let subscription: EmitterSubscription | undefined;

    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
      if (mounted) setReduceMotion(value);
    });

    subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduceMotion(value);
    });

    if (reduceMotion) {
      anim.setValue(0);
      return () => {
        mounted = false;
        subscription?.remove();
      };
    }

    const bounce = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    bounce.start();
    return () => {
      mounted = false;
      bounce.stop();
      subscription?.remove();
    };
  }, [anim, delay, reduceMotion]);

  return (
    <Animated.View
      style={[styles.dot, { transform: [{ translateY: anim }] }]}
    />
  );
}

export function TypingIndicator(): React.JSX.Element {
  return (
    <View style={styles.row}>
      <CoachMark size='sm' />
      <View style={styles.wrap}>
        <Text style={styles.label}>Coach IA</Text>
        <View style={styles.bubble} accessibilityLabel='Coach IA esta digitando'>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: spacing.lg },
  wrap: { maxWidth: '86%' },
  label: {
    marginBottom: 6,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
  },
  bubble: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brandTextMuted,
  },
});
