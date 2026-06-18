import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meals: Meal[] }

export function DayMacroSummary({ meals }: Props): React.JSX.Element {
  const totals = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
      fat: acc.fat + meal.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const items = [
    { label: 'Calorias', value: String(totals.calories), suffix: 'kcal', color: colors.brandPrimary },
    { label: 'Proteínas', value: String(totals.protein), suffix: 'g', color: colors.brandPrimary },
    { label: 'Carboidratos', value: String(totals.carbs), suffix: 'g', color: colors.brandAnchor },
    { label: 'Gorduras', value: String(totals.fat), suffix: 'g', color: colors.brandSupport },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Resumo nutricional</Text>
        <Text style={styles.subtitle}>Total consumido no dia selecionado.</Text>
      </View>
      <View style={styles.grid}>
        {items.map((item, index) => (
          <View key={item.label} style={[styles.stat, index > 1 && styles.statBottom]}>
            <Text style={[styles.value, { color: item.color }]}>{item.value}</Text>
            <Text style={styles.suffix}>{item.suffix}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 18,
  },
  header: { marginBottom: 14 },
  title: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    marginTop: 2,
    paddingTop: 8,
  },
  stat: {
    width: '50%',
    paddingTop: 12,
    paddingBottom: 10,
    paddingRight: 12,
  },
  statBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
  },
  value: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.extraBold,
  },
  suffix: {
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
    marginTop: 2,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.brandAnchor,
    marginTop: 6,
    fontFamily: typography.fontFamily.medium,
  },
});
