import { isImplausibleMeal } from '../food-log/food-log.schemas.js'

/** Mesma tolerância das verificações do dia da dieta (guardrails/day.ts). */
const KCAL_MISMATCH_TOLERANCE = 0.25
const MACROS_WEIGHT_TOLERANCE = 1.05

export interface MealValues {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

/**
 * Valores de uma refeição vindos do modelo (correção ou registro pelo coach):
 * fora dos tetos ou com macros mais pesados que o alimento → null; kcal
 * incoerente com os macros → recalculada (os macros são a informação primária).
 */
export function normalizeMealValues(
  values: MealValues,
  weightGrams: number | null | undefined,
): MealValues | null {
  const out = { ...values }
  const macroGrams = out.protein + out.carbs + out.fat
  if (
    isImplausibleMeal(out) ||
    (weightGrams != null && macroGrams > weightGrams * MACROS_WEIGHT_TOLERANCE)
  ) {
    return null
  }
  const expected = 4 * out.protein + 4 * out.carbs + 9 * out.fat
  if (
    expected > 0 &&
    Math.abs(out.calories - expected) / Math.max(out.calories, 1) > KCAL_MISMATCH_TOLERANCE
  ) {
    out.calories = Math.round(expected)
  }
  return out
}
