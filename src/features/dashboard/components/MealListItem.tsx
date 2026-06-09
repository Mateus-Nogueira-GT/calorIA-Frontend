import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meal: Meal }

export function MealListItem({ meal }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.macros}>P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g</Text>
      </View>
      <Text style={styles.calories}>{meal.calories} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },
  macros: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
});
