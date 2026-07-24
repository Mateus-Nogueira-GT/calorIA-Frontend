import { z } from 'zod'
import { localDateSchema } from '../../shared/local-date.js'

// ─── Responses ────────────────────────────────────────────────────────────────

export const mealSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  loggedAt: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const listMealsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
})

export const addMealBodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(120),
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  /**
   * Data local do cliente (Workstream A). Sem ela, CURRENT_DATE (UTC) — que
   * "vira o dia" às 21h BRT; o app SEMPRE deve enviar.
   */
  date: localDateSchema.optional(),
})

export const mealParamsSchema = z.object({
  id: z.string().uuid(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type Meal = z.infer<typeof mealSchema>
export type ListMealsQuery = z.infer<typeof listMealsQuerySchema>
export type AddMealBody = z.infer<typeof addMealBodySchema>
