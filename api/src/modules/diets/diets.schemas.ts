import { z } from 'zod'

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

// ─── Requests ─────────────────────────────────────────────────────────────────

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
