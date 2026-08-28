import { z } from 'zod'
import { dayNumberSchema, localDateSchema, tzOffsetMinutesSchema } from '../../shared/local-date.js'

// ─── Dieta completa ───────────────────────────────────────────────────────────

export const dietItemSchema = z.object({
  id: z.string().uuid(),
  diet_meal_id: z.string().uuid(),
  food_name: z.string(),
  quantity_g: z.number(),
  unit: z.string(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  preparation_tip: z.string().nullable(),
  is_substitution: z.boolean(),
  sort_order: z.number(),
})

export const dietMealSchema = z.object({
  id: z.string().uuid(),
  diet_day_id: z.string().uuid(),
  meal_type: z.enum(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper']),
  name: z.string(),
  time_suggestion: z.string().nullable(),
  total_calories: z.number(),
  total_protein: z.number(),
  total_carbs: z.number(),
  total_fat: z.number(),
  is_completed: z.boolean(),
  completed_at: z.string().nullable(),
  sort_order: z.number(),
  items: z.array(dietItemSchema),
})

export const dietDaySchema = z.object({
  id: z.string().uuid(),
  diet_id: z.string().uuid(),
  day_number: z.number().int(),
  day_name: z.string(),
  total_calories: z.number(),
  total_protein: z.number(),
  total_carbs: z.number(),
  total_fat: z.number(),
  meals: z.array(dietMealSchema),
})

export const dietSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  user_goal: z.string().nullable(),
  tdee_calories: z.number().int(),
  target_calories: z.number().int(),
  target_protein_g: z.number().int(),
  target_carbs_g: z.number().int(),
  target_fat_g: z.number().int(),
  status: z.enum(['active', 'archived', 'replaced']),
  created_at: z.string(),
  updated_at: z.string(),
})

export const dietWithDaysSchema = dietSchema.extend({
  days: z.array(dietDaySchema),
})

// ─── Dieta de hoje (camelCase — contrato com o frontend / dashboard) ────────────

export const plannedMealItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  calories: z.number(),
})

export const plannedMealSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
  title: z.string(),
  suggestedTime: z.string(),
  items: z.array(plannedMealItemSchema),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  completedAt: z.string().nullable(),
  /**
   * Concluída NO DIA consultado (completed_at convertido pro fuso do cliente).
   * É o campo que o app deve ler — deriva o "reset" diário sem job nenhum.
   */
  completedToday: z.boolean(),
})

export const todayPlanSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  meals: z.array(plannedMealSchema),
  totalCalories: z.number(),
  totalProtein: z.number(),
  totalCarbs: z.number(),
  totalFat: z.number(),
  generatedAt: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

/**
 * Timezone (Workstream A): o app informa seu dia/data local; tudo opcional —
 * na ausência o backend cai no comportamento UTC anterior.
 */
export const todayQuerySchema = z.object({
  dayNumber: dayNumberSchema.optional(),
  date: localDateSchema.optional(),
  tzOffsetMinutes: tzOffsetMinutesSchema.optional(),
})

/**
 * Body opcional do toggle — data local para o streak (A4) e para decidir se a
 * refeição já está concluída NAQUELE dia (B1). Sem tzOffsetMinutes o servidor
 * compara em UTC e o dia "vira" às 21h BRT.
 */
export const toggleMealBodySchema = z
  .object({
    date: localDateSchema.optional(),
    tzOffsetMinutes: tzOffsetMinutesSchema.optional(),
  })
  .nullish()

export const replaceDietItemBodySchema = z.object({
  food_name: z.string().min(2),
  quantity_g: z.number().positive(),
  unit: z.string().default('g'),
  calories: z.number().min(0),
  protein_g: z.number().min(0),
  carbs_g: z.number().min(0),
  fat_g: z.number().min(0),
  preparation_tip: z.string().nullable().default(null),
})

// ─── Responses ────────────────────────────────────────────────────────────────

export const errorSchema = z.object({ error: z.string(), message: z.string() })

// ─── Types ────────────────────────────────────────────────────────────────────

export type Diet = z.infer<typeof dietSchema>
export type DietWithDays = z.infer<typeof dietWithDaysSchema>
export type DietDay = z.infer<typeof dietDaySchema>
export type DietMeal = z.infer<typeof dietMealSchema>
export type ReplaceDietItemBody = z.infer<typeof replaceDietItemBodySchema>
export type TodayQuery = z.infer<typeof todayQuerySchema>
export type TodayPlan = z.infer<typeof todayPlanSchema>
export type PlannedMealType = z.infer<typeof plannedMealSchema>['type']
