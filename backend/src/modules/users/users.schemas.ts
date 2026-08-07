import { z } from 'zod'

// ─── Enums compartilhados ─────────────────────────────────────────────────────

export const genderEnum = z.enum(['male', 'female', 'other'])
export const goalEnum = z.enum(['lose_weight', 'maintain', 'gain_muscle', 'gain_weight', 'health'])
export const activityLevelEnum = z.enum([
  'sedentary', // Sedentário (sem exercício)
  'light', // Levemente ativo (1-3x/semana)
  'moderate', // Moderadamente ativo (3-5x/semana)
  'active', // Ativo (6-7x/semana)
  'very_active', // Muito ativo (2x/dia ou treino intenso)
])
export const bodyTypeEnum = z.enum(['ectomorph', 'mesomorph', 'endomorph', 'unknown'])
export const coachPersonalityEnum = z.enum(['motivational', 'direct', 'empathetic', 'scientific'])
export const coachGenderEnum = z.enum(['male', 'female', 'neutral'])

// ─── Responses ────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  avatar_emoji: z.string().nullable(),
  weight_kg: z.number().positive().nullable(),
  height_cm: z.number().int().positive().nullable(),
  birth_date: z.string().nullable(),
  gender: genderEnum.nullable(),
  goal: goalEnum.nullable(),
  activity_level: activityLevelEnum.nullable(),
  body_type: bodyTypeEnum.nullable(),
  coach_personality: coachPersonalityEnum.nullable(),
  coach_gender: coachGenderEnum.nullable(),
  dietary_restrictions: z.array(z.string()).nullable(),
  allergies: z.array(z.string()).nullable(),
  /** Streak canônico do backend (G5) — o app não deve recalcular localmente. */
  current_streak: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const updateProfileBodySchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username deve ter ao menos 3 caracteres')
      .max(30)
      .regex(/^[a-z0-9_]+$/, 'Username deve conter apenas letras minúsculas, números e underscore')
      .optional(),
    full_name: z.string().min(2).max(100).optional(),
    avatar_url: z.string().url().nullable().optional(),
    avatar_emoji: z.string().min(1).max(16).nullable().optional(),
    weight_kg: z
      .number({ invalid_type_error: 'Peso deve ser um número' })
      .positive('Peso deve ser positivo')
      .max(500, 'Peso inválido')
      .optional(),
    height_cm: z
      .number({ invalid_type_error: 'Altura deve ser um número' })
      .int()
      .positive()
      .max(300, 'Altura inválida')
      .optional(),
    birth_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
      .optional(),
    gender: genderEnum.optional(),
    goal: goalEnum.optional(),
    activity_level: activityLevelEnum.optional(),
    body_type: bodyTypeEnum.optional(),
    coach_personality: coachPersonalityEnum.optional(),
    coach_gender: coachGenderEnum.optional(),
    dietary_restrictions: z.array(z.string()).max(20).optional(),
    allergies: z.array(z.string()).max(20).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  })

export const uploadAvatarBodySchema = z.object({
  /** Imagem em data URL base64 (ex: "data:image/jpeg;base64,...."). */
  image: z
    .string()
    .startsWith('data:image/', 'Imagem deve ser um data URL base64')
    .max(8 * 1024 * 1024, 'Imagem muito grande'),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type Profile = z.infer<typeof profileSchema>
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>
export type UploadAvatarBody = z.infer<typeof uploadAvatarBodySchema>
