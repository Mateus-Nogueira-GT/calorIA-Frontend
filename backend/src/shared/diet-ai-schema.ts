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
  meal_type: z.enum(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper']),
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

/** Um único dia da dieta — usado na geração assíncrona (1 dia por chamada). */
export const aiSingleDaySchema = z.object({
  day_name: z.string(),
  meals: z.array(aiDietMealSchema),
})

/**
 * Limites de plausibilidade (S1 da spec de guardrails). Fora deles o servidor
 * NÃO calcula metas: pede confirmação ao usuário (altura em metros, peso em
 * libras e idade impossível chegavam ao BMR sem ninguém conferir).
 *
 * age começa em 10, não 18, de propósito (D7): queremos que o modelo REPORTE
 * 15 anos para o servidor recusar com a mensagem certa, em vez de o modelo
 * "arredondar" para 18 só para passar no schema.
 */
export const COLLECTED_BOUNDS = {
  weightKg: [30, 300],
  heightCm: [120, 250],
  age: [10, 100],
  mealsPerDay: [3, 6],
  listMaxItems: 10,
  listItemMaxChars: 40,
  preferencesMaxChars: 300,
} as const

const shortList = z
  .array(z.string().max(COLLECTED_BOUNDS.listItemMaxChars))
  .max(COLLECTED_BOUNDS.listMaxItems)

/** Dados coletados pelo chat antes de gerar a dieta */
export const collectedUserDataSchema = z.object({
  weight_kg: z.number().min(COLLECTED_BOUNDS.weightKg[0]).max(COLLECTED_BOUNDS.weightKg[1]),
  height_cm: z.number().min(COLLECTED_BOUNDS.heightCm[0]).max(COLLECTED_BOUNDS.heightCm[1]),
  age: z.number().int().min(COLLECTED_BOUNDS.age[0]).max(COLLECTED_BOUNDS.age[1]),
  gender: z.enum(['male', 'female', 'other']),
  goal: z.enum(['lose_weight', 'maintain', 'gain_muscle', 'gain_weight']),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  meals_per_day: z
    .number()
    .int()
    .min(COLLECTED_BOUNDS.mealsPerDay[0])
    .max(COLLECTED_BOUNDS.mealsPerDay[1]),
  dietary_restrictions: shortList,
  allergies: shortList,
  food_preferences: z.string().max(COLLECTED_BOUNDS.preferencesMaxChars).nullable(),
  message_to_user: z.string(),
  // Gestação, diagnóstico, transtorno alimentar… (D2). Default [] para jobs
  // gravados antes desta versão continuarem parseáveis em processJobStep.
  health_conditions: shortList.default([]),
})

export type AiDietPlan = z.infer<typeof aiDietPlanSchema>
export type AiSingleDay = z.infer<typeof aiSingleDaySchema>
export type CollectedUserData = z.infer<typeof collectedUserDataSchema>
