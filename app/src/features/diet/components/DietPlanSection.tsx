import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '@navigation/types';
import { useDiet } from '../hooks/useDiet';
import { useDietStore } from '../store';
import { DietProgressHeader } from './DietProgressHeader';
import { MealPlanCard } from './MealPlanCard';
import { EmptyDietState } from './EmptyDietState';
import { MealCardSkeleton } from './MealCardSkeleton';

export function DietPlanSection(): React.JSX.Element {
  const { plan, togglingMealId, toggleMealComplete, completedCount, totalCount } = useDiet();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const isLoading = useDietStore((s) => s.isLoading);

  if (plan === undefined || isLoading) {
    return (
      <View>
        <MealCardSkeleton />
        <MealCardSkeleton />
        <MealCardSkeleton />
        <MealCardSkeleton />
      </View>
    );
  }

  if (plan === null) {
    return <EmptyDietState onAction={() => nav.navigate('Coach')} />;
  }

  return (
    <View style={styles.container}>
      <DietProgressHeader completedCount={completedCount} totalCount={totalCount} />
      {plan.meals.map((meal) => (
        <MealPlanCard
          key={meal.id}
          meal={meal}
          isToggling={togglingMealId === meal.id}
          onToggleComplete={toggleMealComplete}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
});
