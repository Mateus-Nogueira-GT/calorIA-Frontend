import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import type { MealItem } from '@shared/services/diet.service';

interface Props {
  item: MealItem;
}

function formatQuantity(q: number, unit: string): string {
  const qStr = Number.isInteger(q) ? q.toString() : q.toFixed(1).replace(/\.0$/, '');
  return `${qStr} ${unit}`;
}

export function MealItemRow({ item }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.qty}>{formatQuantity(item.quantity, item.unit)}</Text>
      </View>
      <Text style={styles.kcal}>{item.calories} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  left: { flexShrink: 1, paddingRight: 8 },
  name: { fontSize: typography.fontSize.sm, color: colors.brandText, fontFamily: typography.fontFamily.medium },
  qty: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted, marginTop: 2 },
  kcal: { fontSize: typography.fontSize.xs, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
});
