import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors } from '@theme';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, number> = { sm: 28, md: 36, lg: 48 };
const FONT_MAP: Record<Size, number> = { sm: 14, md: 18, lg: 24 };

interface Props {
  size?: Size;
  emoji?: string;
  backgroundColor?: string;
}

export function Avatar({ size = 'md', emoji = '🤖', backgroundColor }: Props): React.JSX.Element {
  const dim = SIZE_MAP[size];
  return (
    <View
      style={[
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        { backgroundColor: backgroundColor ?? colors.primary },
      ]}
    >
      <Text style={{ fontSize: FONT_MAP[size] }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
