import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';
import { FoodLogItem } from './FoodLogItem';

interface Props { title: string; meals: Meal[]; onDelete: (id: string) => void | Promise<void> }

export function MealSection({ title, meals, onDelete }: Props): React.JSX.Element | null {
  if (meals.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{meals.length} {meals.length === 1 ? 'refeição' : 'refeições'}</Text>
      </View>
      <View style={styles.card}>
        {meals.map((meal, index) => (
          <FoodLogItem key={meal.id} meal={meal} onDelete={onDelete} hideBorder={index === meals.length - 1} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
    gap: 10,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  count: {
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
  },
  card: {
    backgroundColor: colors.brandSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    overflow: 'hidden',
  },
});
