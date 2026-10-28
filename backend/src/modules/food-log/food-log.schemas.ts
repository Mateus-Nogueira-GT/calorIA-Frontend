import { z } from 'zod'
import { localDateSchema } from '../../shared/local-date.js'

// ─── Responses ────────────────────────────────────────────────────────────────

/** 4 grupos do app + 'other' (registros antigos caem no heurístico por hora). */
export const appMealTypeSchema = z.enum(['breakfast', 'lunch', 'snack', 'dinner', 'other'])

export const mealSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  /** Fibra (g). null = sem dado (registro anterior à migration 022). */
  fiber: z.number().nullable(),
  loggedAt: z.string(),
  mealType: appMealTypeSchema,
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const listMealsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
})

/**
 * Teto de plausibilidade de UMA refeição. Folgado de propósito: um rodízio
 * inteiro cabe, um erro de digitação com três zeros a mais não. O app espelha
 * estes valores em app/src/features/food-log/meal-limits.ts.
 */
export const MEAL_LIMITS = { calories: 5000, protein: 500, carbs: 500, fat: 500, fiber: 150 }

/**
 * Registro gravado antes dos tetos (ex.: 999.999 em tudo, feedback de 27/10):
 * não é uma refeição, é lixo. Não entra em nenhuma soma — dia, semana, coach.
 */
export function isImplausibleMeal(m: {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number | null
}): boolean {
  return (
    m.calories > MEAL_LIMITS.calories ||
    m.protein > MEAL_LIMITS.protein ||
    m.carbs > MEAL_LIMITS.carbs ||
    m.fat > MEAL_LIMITS.fat ||
    (m.fiber ?? 0) > MEAL_LIMITS.fiber
  )
}

const mealNumber = (max: number, unit: string) =>
  z
    .number()
    .finite()
    .min(0)
    .max(max, `Máximo de ${max.toLocaleString('pt-BR')} ${unit} por refeição`)

export const addMealBodySchema = z.object({
  weightGrams: z.number().finite().min(0.1).max(100_000).optional(),
  name: z.string().min(1, 'Nome é obrigatório').max(120),
  calories: mealNumber(MEAL_LIMITS.calories, 'kcal'),
  protein: mealNumber(MEAL_LIMITS.protein, 'g'),
  carbs: mealNumber(MEAL_LIMITS.carbs, 'g'),
  fat: mealNumber(MEAL_LIMITS.fat, 'g'),
  /** Fibra (g). Ausente/null = sem dado. */
  fiber: mealNumber(MEAL_LIMITS.fiber, 'g').nullable().optional(),
  /**
   * Data local do cliente (Workstream A). Sem ela, CURRENT_DATE (UTC) — que
   * "vira o dia" às 21h BRT; o app SEMPRE deve enviar.
   */
  date: localDateSchema.optional(),
  /** Tipo da refeição (D4) — registros sem tipo continuam como 'other'. */
  mealType: appMealTypeSchema.optional().default('other'),
})

/**
 * PATCH: mesmo corpo do POST, sem a data (a refeição não muda de dia). O tipo é
 * obrigatório: herdar o default 'other' do POST faria um PATCH sem tipo tirar a
 * refeição do grupo escolhido.
 */
export const updateMealBodySchema = addMealBodySchema
  .omit({ date: true })
  .extend({ mealType: appMealTypeSchema })

export const mealParamsSchema = z.object({
  id: z.string().uuid(),
})

/** G4: resumo agregado por dia — evita 1 request por dia no gráfico semanal. */
export const summaryQuerySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
})

export const daySummarySchema = z.object({
  date: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type Meal = z.infer<typeof mealSchema>
export type ListMealsQuery = z.infer<typeof listMealsQuerySchema>
export type AddMealBody = z.infer<typeof addMealBodySchema>
export type UpdateMealBody = z.infer<typeof updateMealBodySchema>
export type SummaryQuery = z.infer<typeof summaryQuerySchema>
export type DaySummary = z.infer<typeof daySummarySchema>
