import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meal: Meal; onDelete: (id: string) => void }

export function FoodLogItem({ meal, onDelete }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.macros}>P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.calories}>{meal.calories} kcal</Text>
        <TouchableOpacity onPress={() => onDelete(meal.id)} style={styles.deleteBtn} testID={`delete-${meal.id}`}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },
  macros: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  deleteBtn: { padding: 4 },
  deleteText: { fontSize: 12, color: colors.error },
});
