import { z } from 'zod'

export const weightEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  weightKg: z.number(),
})

export const addWeightBodySchema = z.object({
  weightKg: z
    .number({ invalid_type_error: 'Peso deve ser um número' })
    .positive('Peso deve ser positivo')
    .max(500, 'Peso inválido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export type WeightEntry = z.infer<typeof weightEntrySchema>
export type AddWeightBody = z.infer<typeof addWeightBodySchema>
