import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@theme';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '@navigation/types';
import { useDiet } from '../hooks/useDiet';
import { useDietStore } from '../store';
import { useCoachStore } from '@features/coach/store';
import { DietProgressHeader } from './DietProgressHeader';
import { MealPlanCard } from './MealPlanCard';
import { EmptyDietState } from './EmptyDietState';
import { MealCardSkeleton } from './MealCardSkeleton';
import { ErrorState } from '@shared/components';

export function DietPlanSection(): React.JSX.Element {
  const { plan, togglingMealId, toggleMealComplete, completedCount, totalCount } = useDiet();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const isLoading = useDietStore((s) => s.isLoading);
  const error = useDietStore((s) => s.error);
  const loadCurrent = useDietStore((s) => s.loadCurrent);
  const todayStatus = useDietStore((s) => s.todayStatus);
  const retryDietGeneration = useCoachStore((s) => s.retryDietGeneration);

  if (isLoading) {
    return (
      <View style={styles.stateBlock}>
        <MealCardSkeleton />
        <MealCardSkeleton />
      </View>
    );
  }

  // Erro ANTES do vazio: sem isso uma falha de rede era exibida como
  // "você não tem dieta" (ou como esqueleto eterno, quando plan===undefined).
  if (error) {
    return (
      <View style={styles.stateBlock}>
        <ErrorState
          title="Não foi possível carregar seu plano"
          onRetry={() => void loadCurrent()}
        />
      </View>
    );
  }

  if (plan === undefined) {
    return (
      <View style={styles.stateBlock}>
        <MealCardSkeleton />
        <MealCardSkeleton />
      </View>
    );
  }

  if (plan === null) {
    // M8: dieta ativa com o dia de hoje não gerado ≠ não ter dieta.
    if (todayStatus?.dayMissing) {
      return (
        <EmptyDietState
          mode="incomplete"
          onAction={() => {
            if (todayStatus.resumableJobId) {
              void retryDietGeneration(todayStatus.resumableJobId);
            } else {
              nav.navigate('Coach');
            }
          }}
        />
      );
    }
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
  container: { marginTop: spacing.sm },
  stateBlock: { marginTop: spacing.sm },
});
