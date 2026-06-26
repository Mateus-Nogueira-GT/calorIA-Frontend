import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

export const DEFAULT_CALORIE_GOAL = 2000;

export function getDailyCalorieGoal(plan: DietPlan | null | undefined): number {
  return plan && plan.totalCalories > 0 ? plan.totalCalories : DEFAULT_CALORIE_GOAL;
}

export function sumCalories(meals: Meal[]): number {
  return meals.reduce((acc, m) => acc + m.calories, 0);
}
