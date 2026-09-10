import type { AiSingleDay } from '../diet-ai-schema.js'

/**
 * Guardrails da SAÍDA de um dia gerado (O2/O3 da spec). Antes, só as calorias
 * eram reconciliadas; nº de refeições, meal_type repetido, quantidade zero,
 * kcal incoerente com macros e proteína longe da meta passavam direto.
 */

export const MEAL_TYPE_ORDER = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'dinner',
  'supper',
] as const
export type MealType = (typeof MEAL_TYPE_ORDER)[number]

const MEAL_SETS: Record<number, MealType[]> = {
  3: ['breakfast', 'lunch', 'dinner'],
  4: ['breakfast', 'lunch', 'afternoon_snack', 'dinner'],
  5: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner'],
  6: ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper'],
}

/** Tipos exatos que um dia com N refeições deve conter, na ordem canônica (O5). */
export function mealTypesFor(mealsPerDay: number): MealType[] {
  const n = Math.min(6, Math.max(3, Math.round(mealsPerDay)))
  return [...MEAL_SETS[n]]
}

export type DayViolationType =
  | 'ALLERGEN'
  | 'MEAL_COUNT'
  | 'DUPLICATE_MEAL_TYPE'
  | 'MEAL_ORDER'
  | 'NON_POSITIVE_QUANTITY'
  | 'NEGATIVE_MACRO'
  | 'PROTEIN_OFF_TARGET'
  | 'RECONCILE_FAILED'

export interface DayViolation {
  type: DayViolationType
  detail: string
}

export const KCAL_MISMATCH_TOLERANCE = 0.25
export const PROTEIN_TOLERANCE = 0.2
export const RECONCILE_FAIL_TOLERANCE = 0.15

export function kcalFromMacros(p: number, c: number, f: number): number {
  return 4 * p + 4 * c + 9 * f
}

/** Arredonda preservando frações pequenas: ≥10 → inteiro; <10 → 1 casa. */
function roundSmart(n: number): number {
  if (n >= 10) return Math.round(n)
  return Math.round(n * 10) / 10
}

function mealTotal(items: { calories: number }[]): number {
  return roundSmart(items.reduce((s, i) => s + i.calories, 0))
}

/**
 * kcal do item incoerente com 4p+4c+9g (>25%) → recalcula pelos macros. É a
 * única violação CORRIGÍVEL: os macros são a informação primária; a kcal é
 * derivada e o modelo erra a soma com frequência.
 */
export function fixItemCalories(day: AiSingleDay): { day: AiSingleDay; fixed: number } {
  let fixed = 0
  const meals = day.meals.map((meal) => {
    const items = meal.items.map((it) => {
      const expected = kcalFromMacros(it.protein_g, it.carbs_g, it.fat_g)
      if (expected <= 0) return it
      const drift = Math.abs(it.calories - expected) / Math.max(it.calories, 1)
      if (drift <= KCAL_MISMATCH_TOLERANCE) return it
      fixed++
      return { ...it, calories: roundSmart(expected) }
    })
    return { ...meal, items, total_calories: mealTotal(items) }
  })
  return { day: { ...day, meals }, fixed }
}

export function validateDay(
  day: AiSingleDay,
  targets: { protein: number },
  mealsPerDay: number,
): DayViolation[] {
  const v: DayViolation[] = []
  const expected = mealTypesFor(mealsPerDay)
  const types = day.meals.map((m) => m.meal_type)

  if (types.length !== expected.length) {
    v.push({
      type: 'MEAL_COUNT',
      detail: `vieram ${types.length} refeições; precisam ser exatamente ${expected.length}: ${expected.join(', ')}`,
    })
  }
  const dup = types.find((t, i) => types.indexOf(t) !== i)
  if (dup) {
    v.push({ type: 'DUPLICATE_MEAL_TYPE', detail: `meal_type repetido: ${dup}` })
  }
  if (types.length === expected.length && !dup && types.some((t, i) => t !== expected[i])) {
    v.push({
      type: 'MEAL_ORDER',
      detail: `os meal_type devem ser, nesta ordem: ${expected.join(', ')} (vieram: ${types.join(', ')})`,
    })
  }

  let protein = 0
  day.meals.forEach((meal, mi) => {
    meal.items.forEach((it, ii) => {
      protein += it.protein_g
      if (!(it.quantity_g > 0)) {
        v.push({
          type: 'NON_POSITIVE_QUANTITY',
          detail: `refeição ${mi + 1}, item ${ii + 1} ('${it.food_name}') com quantidade ${it.quantity_g}`,
        })
      }
      if (it.protein_g < 0 || it.carbs_g < 0 || it.fat_g < 0 || it.calories < 0) {
        v.push({
          type: 'NEGATIVE_MACRO',
          detail: `refeição ${mi + 1}, item ${ii + 1} ('${it.food_name}') com valor negativo`,
        })
      }
    })
  })

  if (targets.protein > 0) {
    const drift = Math.abs(protein - targets.protein) / targets.protein
    if (drift > PROTEIN_TOLERANCE) {
      v.push({
        type: 'PROTEIN_OFF_TARGET',
        detail: `proteína total ${Math.round(protein)} g; meta ${targets.protein} g (tolerância ±20%)`,
      })
    }
  }
  return v
}

// ─── Reconciliação com a meta (I4, movida do jobs.service) ───────────────────

const RECONCILE_TOLERANCE = 0.1 // ±10% da meta é aceitável
const RECONCILE_MIN_FACTOR = 0.6
const RECONCILE_MAX_FACTOR = 1.6

/**
 * Escala determinística do dia para bater a meta de calorias (I4). O modelo às
 * vezes entrega um dia 20-40% fora da meta; em vez de re-chamar a IA (caro/lento
 * e não-determinístico), reescalamos as quantidades proporcionalmente.
 * - Desvio ≤ 10% → intacto.
 * - Fora disso → fator = meta/total, limitado a [0.6, 1.6] (evita distorção
 *   absurda quando a geração vem muito errada).
 */
export function reconcileDay(
  day: AiSingleDay,
  targetCalories: number,
): { day: AiSingleDay; scaled: boolean; factor: number } {
  let total = 0
  for (const meal of day.meals) for (const it of meal.items) total += it.calories

  if (total <= 0 || targetCalories <= 0) return { day, scaled: false, factor: 1 }
  if (Math.abs(total - targetCalories) / targetCalories <= RECONCILE_TOLERANCE) {
    return { day, scaled: false, factor: 1 }
  }

  const factor = Math.min(
    RECONCILE_MAX_FACTOR,
    Math.max(RECONCILE_MIN_FACTOR, targetCalories / total),
  )

  const scaledDay: AiSingleDay = {
    ...day,
    meals: day.meals.map((meal) => {
      const items = meal.items.map((it) => ({
        ...it,
        quantity_g: roundSmart(it.quantity_g * factor),
        calories: roundSmart(it.calories * factor),
        protein_g: roundSmart(it.protein_g * factor),
        carbs_g: roundSmart(it.carbs_g * factor),
        fat_g: roundSmart(it.fat_g * factor),
      }))
      return { ...meal, items, total_calories: mealTotal(items) }
    }),
  }
  return { day: scaledDay, scaled: true, factor }
}

/**
 * O3: o clamp [0.6, 1.6] podia persistir um dia 50% fora da meta com um
 * log.info. Agora, se depois de escalar ainda estiver >15% fora, é violação.
 */
export function reconcileOrFail(
  day: AiSingleDay,
  targetCalories: number,
):
  | { ok: true; day: AiSingleDay; scaled: boolean; factor: number }
  | { ok: false; day: AiSingleDay; violation: DayViolation } {
  const r = reconcileDay(day, targetCalories)
  let total = 0
  for (const meal of r.day.meals) for (const it of meal.items) total += it.calories
  if (
    targetCalories > 0 &&
    Math.abs(total - targetCalories) / targetCalories > RECONCILE_FAIL_TOLERANCE
  ) {
    return {
      ok: false,
      day: r.day,
      violation: {
        type: 'RECONCILE_FAILED',
        detail: `total do dia ${Math.round(total)} kcal (já reescalonado); meta ${targetCalories} kcal — gere as quantidades próximas da meta`,
      },
    }
  }
  return { ok: true, ...r }
}

/** Feedback para o prompt da segunda tentativa (O4). */
export function describeViolations(violations: DayViolation[]): string {
  const lines = violations.map((v) => `- [${v.type}] ${v.detail}`)
  return `ATENÇÃO — a tentativa anterior foi REJEITADA pelos motivos abaixo. Gere o dia de novo corrigindo TODOS:\n${lines.join('\n')}`
}
