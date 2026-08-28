import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

export const DEFAULT_CALORIE_GOAL = 2000;

export function getDailyCalorieGoal(plan: DietPlan | null | undefined): number {
  return plan && plan.totalCalories > 0 ? plan.totalCalories : DEFAULT_CALORIE_GOAL;
}

export function sumCalories(meals: Meal[]): number {
  return meals.reduce((acc, m) => acc + m.calories, 0);
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

type MacroSource = Pick<DayTotals, 'calories' | 'protein' | 'carbs' | 'fat'>;

function sumMacros(items: MacroSource[]): DayTotals {
  return items.reduce<DayTotals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * M6: regra ÚNICA do que a pessoa comeu no dia — refeições do plano concluídas
 * mais o diário livre (que inclui o scanner). Dashboard e Diário somavam
 * diferente e comparavam com a mesma meta: o mesmo dia aparecia como
 * "2000 / 2000" numa tela e "200 / 2000" na outra.
 *
 * `plan` só existe para HOJE (completedToday não diz nada sobre dias anteriores),
 * então em dias passados o chamador passa apenas o diário livre.
 */
export function getDayTotals(params: {
  planMeals?: { completedToday: boolean; calories: number; protein: number; carbs: number; fat: number }[];
  freeMeals: MacroSource[];
}): DayTotals {
  const completedPlanned = (params.planMeals ?? []).filter((m) => m.completedToday);
  const planned = sumMacros(completedPlanned);
  const free = sumMacros(params.freeMeals);
  return {
    calories: planned.calories + free.calories,
    protein: planned.protein + free.protein,
    carbs: planned.carbs + free.carbs,
    fat: planned.fat + free.fat,
  };
}
