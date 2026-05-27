import { z } from 'zod'

/**
 * Schema da dieta gerada pela IA via Structured Output.
 * Usado em duas frentes:
 *  1. Como response_format no zodResponseFormat (OpenAI)
 *  2. Para validar/tipar o resultado antes de persistir no banco
 *
 * IMPORTANTE: OpenAI Structured Outputs exige que todos os campos de objetos
 * sejam obrigatórios. Use .nullable() para campos opcionais.
 */

export const aiDietItemSchema = z.object({
  food_name: z.string(),
  quantity_g: z.number(),
  unit: z.string(),
  calories: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
  preparation_tip: z.string().nullable(),
})

export const aiDietMealSchema = z.object({
  meal_type: z.enum([
    'breakfast',
    'morning_snack',
    'lunch',
    'afternoon_snack',
    'dinner',
    'supper',
  ]),
  name: z.string(),
  time_suggestion: z.string(),
  total_calories: z.number(),
  items: z.array(aiDietItemSchema),
})

export const aiDietDaySchema = z.object({
  day_number: z.number().int(),
  day_name: z.string(),
  total_calories: z.number(),
  total_protein: z.number(),
  total_carbs: z.number(),
  total_fat: z.number(),
  meals: z.array(aiDietMealSchema),
})

export const aiDietPlanSchema = z.object({
  name: z.string(),
  description: z.string(),
  tdee_calories: z.number().int(),
  target_calories: z.number().int(),
  target_protein_g: z.number().int(),
  target_carbs_g: z.number().int(),
  target_fat_g: z.number().int(),
  days: z.array(aiDietDaySchema),
})

/** Dados coletados pelo chat antes de gerar a dieta */
export const collectedUserDataSchema = z.object({
  weight_kg: z.number(),
  height_cm: z.number(),
  age: z.number().int(),
  gender: z.enum(['male', 'female', 'other']),
  goal: z.enum(['lose_weight', 'maintain', 'gain_muscle', 'gain_weight']),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  meals_per_day: z.number().int().min(3).max(6),
  dietary_restrictions: z.array(z.string()),
  allergies: z.array(z.string()),
  food_preferences: z.string().nullable(),
  message_to_user: z.string(),
})

export type AiDietPlan = z.infer<typeof aiDietPlanSchema>
export type CollectedUserData = z.infer<typeof collectedUserDataSchema>
