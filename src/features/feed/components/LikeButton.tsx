import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, typography } from '@theme';

interface Props {
  liked: boolean;
  count: number;
  onPress: () => void;
}

export function LikeButton({ liked, count, onPress }: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      testID='like-button'
      onPress={handlePress}
      accessibilityRole='button'
      accessibilityState={{ selected: liked }}
      style={styles.row}
      hitSlop={8}
    >
      <Animated.Text style={[styles.heart, { color: liked ? colors.brandPrimary : colors.brandTextMuted, transform: [{ scale }] }]}>
        {liked ? '♥' : '♡'}
      </Animated.Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heart: { fontSize: 20 },
  count: { fontSize: 14, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
});
