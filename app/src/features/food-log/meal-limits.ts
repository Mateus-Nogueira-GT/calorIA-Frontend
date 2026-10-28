import type { DayTotals } from '@shared/utils/calories';
import { MEAL_LIMITS } from '@shared/utils/meal-plausibility';

export { MEAL_LIMITS };

export type MealField = keyof typeof MEAL_LIMITS;

export function mealLimitMessage(field: MealField): string {
  const unit = field === 'calories' ? 'kcal' : 'g';
  return `Máximo de ${MEAL_LIMITS[field].toLocaleString('pt-BR')} ${unit} por refeição`;
}

export interface MealGoals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface GoalWarning {
  /** Total de calorias do dia já contando esta refeição. */
  dayCalories: number;
  /** % da meta de calorias que o dia atinge com esta refeição. */
  dayPercent: number;
  calorieGoal: number;
}

/** A refeição sozinha passa desta fração da meta de calorias do dia. */
const MEAL_SHARE_LIMIT = 0.6;
/** O dia, com esta refeição, passa desta fração da meta de calorias. */
const DAY_SHARE_LIMIT = 1.5;

/**
 * Pedido do usuário (feedback de 27/10): avisar antes de salvar uma refeição
 * que passa muito da meta. Não bloqueia; só pede confirmação. Sem meta de
 * calorias (sem dieta) não há com o que comparar.
 */
export function checkAgainstGoals(
  meal: Pick<DayTotals, 'calories' | 'protein' | 'carbs' | 'fat'>,
  dayBefore: Pick<DayTotals, 'calories'>,
  goals: MealGoals,
): GoalWarning | null {
  const calorieGoal = goals.calories;
  if (calorieGoal === null || calorieGoal <= 0) return null;
  const dayCalories = dayBefore.calories + meal.calories;
  const macroOver = (['protein', 'carbs', 'fat'] as const).some((k) => {
    const goal = goals[k];
    return goal !== null && goal > 0 && meal[k] > goal;
  });
  const over =
    meal.calories > calorieGoal * MEAL_SHARE_LIMIT ||
    dayCalories > calorieGoal * DAY_SHARE_LIMIT ||
    macroOver;
  if (!over) return null;
  return {
    dayCalories: Math.round(dayCalories),
    dayPercent: Math.round((dayCalories / calorieGoal) * 100),
    calorieGoal: Math.round(calorieGoal),
  };
}
