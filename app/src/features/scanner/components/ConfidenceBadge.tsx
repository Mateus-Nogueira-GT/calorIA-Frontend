import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { confidence: number }

export function ConfidenceBadge({ confidence }: Props): React.JSX.Element {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.85 ? colors.success : confidence >= 0.6 ? colors.warning : colors.error;
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{pct}% de confiança</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  text: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.semiBold },
});
