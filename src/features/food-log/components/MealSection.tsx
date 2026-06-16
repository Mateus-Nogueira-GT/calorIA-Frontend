import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';
import { FoodLogItem } from './FoodLogItem';

interface Props { title: string; meals: Meal[]; onDelete: (id: string) => void }

export function MealSection({ title, meals, onDelete }: Props): React.JSX.Element | null {
  if (meals.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.card}>
        {meals.map((meal) => <FoodLogItem key={meal.id} meal={meal} onDelete={onDelete} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
