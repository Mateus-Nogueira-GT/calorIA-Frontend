import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meals: Meal[] }

export function DayMacroSummary({ meals }: Props): React.JSX.Element {
  const t = meals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return (
    <View style={styles.container}>
      {[
        { label: 'kcal', value: String(t.calories), color: colors.primary },
        { label: 'prot.', value: `${t.protein}g`, color: '#FF8C42' },
        { label: 'carbs', value: `${t.carbs}g`, color: '#17A2B8' },
        { label: 'gord.', value: `${t.fat}g`, color: '#FFC107' },
      ].map((item, i, arr) => (
        <React.Fragment key={item.label}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: item.color }]}>{item.value}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
          {i < arr.length - 1 && <View style={styles.divider} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: { alignItems: 'center' },
  value: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  divider: { width: 1, height: 24, backgroundColor: colors.border },
});
