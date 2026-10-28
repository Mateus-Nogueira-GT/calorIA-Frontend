/**
 * Teto de plausibilidade de UMA refeição. Espelha MEAL_LIMITS de
 * backend/src/modules/food-log/food-log.schemas.ts, que é a fonte da verdade.
 */
export const MEAL_LIMITS = { calories: 5000, protein: 500, carbs: 500, fat: 500, fiber: 150 };

/**
 * Registro gravado antes dos tetos (ex.: 999.999 em tudo, feedback de 27/10)
 * não é uma refeição: não entra em nenhuma soma nem tem os números exibidos.
 */
export function isImplausibleMeal(m: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
}): boolean {
  return (
    m.calories > MEAL_LIMITS.calories ||
    m.protein > MEAL_LIMITS.protein ||
    m.carbs > MEAL_LIMITS.carbs ||
    m.fat > MEAL_LIMITS.fat ||
    (m.fiber ?? 0) > MEAL_LIMITS.fiber
  );
}
