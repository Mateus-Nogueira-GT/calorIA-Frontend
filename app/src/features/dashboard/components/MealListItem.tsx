import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props {
  meal: Meal;
  hideBorder?: boolean;
}

export function MealListItem({ meal, hideBorder }: Props): React.JSX.Element {
  return (
    <View style={[styles.container, hideBorder && styles.containerLast]}>
      <View style={styles.info}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.macros}>P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g</Text>
      </View>
      <Text style={styles.calories}>{meal.calories} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.md,
  },
  containerLast: { borderBottomWidth: 0 },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.base, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
  macros: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted, marginTop: spacing.xs },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.brandAnchor },
});
