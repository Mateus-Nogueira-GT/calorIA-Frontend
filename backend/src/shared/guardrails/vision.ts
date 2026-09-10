import { kcalFromMacros } from './day.js'

/**
 * OP3: a visão só garantia `≥ 0`. Um prato de 40 000 kcal passava e a confiança
 * era clampada e depois ignorada.
 */
export const VISION_MAX_KCAL = 3000
export const VISION_UNCERTAIN_BELOW = 0.5
const KCAL_MISMATCH_TOLERANCE = 0.25

export function sanitizeVisionResult(a: {
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
}): {
  calories: number
  protein: number
  carbs: number
  fat: number
  confidence: number
  uncertain: boolean
} {
  let protein = Math.max(0, Math.round(a.protein))
  let carbs = Math.max(0, Math.round(a.carbs))
  let fat = Math.max(0, Math.round(a.fat))
  let calories = Math.max(0, Math.round(a.calories))

  const expected = kcalFromMacros(protein, carbs, fat)
  if (
    expected > 0 &&
    Math.abs(calories - expected) / Math.max(calories, 1) > KCAL_MISMATCH_TOLERANCE
  ) {
    calories = Math.round(expected)
  }
  if (calories > VISION_MAX_KCAL) {
    const factor = VISION_MAX_KCAL / calories
    protein = Math.round(protein * factor)
    carbs = Math.round(carbs * factor)
    fat = Math.round(fat * factor)
    calories = VISION_MAX_KCAL
  }

  const confidence = Math.min(1, Math.max(0, a.confidence))
  return {
    calories,
    protein,
    carbs,
    fat,
    confidence,
    uncertain: confidence < VISION_UNCERTAIN_BELOW,
  }
}
