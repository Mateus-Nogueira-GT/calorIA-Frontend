import type { AiSingleDay } from '../diet-ai-schema.js'
import { checkAllergens } from './allergens.js'
import {
  type DayViolation,
  describeViolations,
  fixItemCalories,
  reconcileOrFail,
  validateDay,
} from './day.js'

export * from './collected-data.js'
export * from './allergens.js'
export * from './day.js'

export type DayGuardrailCode = 'ALLERGEN_IN_OUTPUT' | 'RECONCILE_FAILED' | 'DAY_VALIDATION_FAILED'

export type DayGuardrailResult =
  | { ok: true; day: AiSingleDay; notes: string[] }
  | { ok: false; code: DayGuardrailCode; violations: DayViolation[]; feedback: string }

/**
 * Pipeline de um dia gerado (O4). Ordem: alérgenos → kcal coerente → reconcile
 * → validação sobre o dia JÁ reescalonado (a proteína escala junto; validar
 * antes daria falso positivo). Junta TODAS as violações no feedback — a segunda
 * tentativa recebe a lista completa, não só a primeira.
 */
export function applyDayGuardrails(
  day: AiSingleDay,
  input: { allergies: string[]; dietary_restrictions: string[]; meals_per_day: number },
  targets: { targetCalories: number; protein: number },
): DayGuardrailResult {
  const violations: DayViolation[] = []
  const notes: string[] = []

  for (const a of checkAllergens(day, input.allergies, input.dietary_restrictions)) {
    const item = day.meals[a.mealIndex]?.items[a.itemIndex]
    const texto = a.field === 'food_name' ? item?.food_name : item?.preparation_tip
    violations.push({
      type: 'ALLERGEN',
      detail: `'${texto}' contém "${a.matched}" (PROIBIDO — ${a.source}); remova qualquer traço`,
    })
  }

  const fixed = fixItemCalories(day)
  if (fixed.fixed > 0) notes.push(`kcal recalculada pelos macros em ${fixed.fixed} item(ns)`)

  const rec = reconcileOrFail(fixed.day, targets.targetCalories)
  if (!rec.ok) violations.push(rec.violation)
  else if (rec.scaled) notes.push(`dia reescalonado para a meta (fator ${rec.factor.toFixed(3)})`)

  violations.push(...validateDay(rec.day, targets, input.meals_per_day))

  if (violations.length === 0) return { ok: true, day: rec.day, notes }

  const code: DayGuardrailCode = violations.some((v) => v.type === 'ALLERGEN')
    ? 'ALLERGEN_IN_OUTPUT'
    : violations.some((v) => v.type === 'RECONCILE_FAILED')
      ? 'RECONCILE_FAILED'
      : 'DAY_VALIDATION_FAILED'
  return { ok: false, code, violations, feedback: describeViolations(violations) }
}
