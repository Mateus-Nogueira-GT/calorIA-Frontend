import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing } from '@theme';
import { formatDelta, spokenDelta } from '../format';

interface Props {
  label: string;
  /** Valor já formatado para exibição. */
  value: string;
  /** Comparação com o período anterior (valores numéricos crus). */
  compare?: { value: number; previous: number };
  hint?: string;
  width: `${number}%`;
}

export function MetricCard({ label, value, compare, hint, width }: Props): React.JSX.Element {
  const delta = compare ? formatDelta(compare.value, compare.previous) : null;
  const spoken = [
    `${label}: ${value}`,
    compare ? spokenDelta(compare.value, compare.previous) : null,
    hint ?? null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={[styles.card, { width }]} accessible accessibilityLabel={spoken}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <Text variant="heading2">{value}</Text>
      {delta && (
        <Text variant="caption" style={styles.delta}>
          {delta === '—' ? 'sem período anterior' : `${delta} vs. período anterior`}
        </Text>
      )}
      {hint && <Text variant="caption">{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { color: colors.brandTextMuted },
  delta: { color: colors.brandTextMuted },
});
