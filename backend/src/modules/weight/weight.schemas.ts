import { z } from 'zod'
import { BODY_LIMITS } from '../../shared/body-limits.js'

const WEIGHT_MESSAGE = `Peso deve ficar entre ${BODY_LIMITS.weightKg.min} e ${BODY_LIMITS.weightKg.max} kg`

export const weightEntrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  weightKg: z.number(),
})

export const addWeightBodySchema = z.object({
  weightKg: z
    .number({ invalid_type_error: 'Peso deve ser um número' })
    // Era > 0 e até 500 kg: 0,5 kg entrava no gráfico da Evolução.
    .min(BODY_LIMITS.weightKg.min, WEIGHT_MESSAGE)
    .max(BODY_LIMITS.weightKg.max, WEIGHT_MESSAGE),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export type WeightEntry = z.infer<typeof weightEntrySchema>
export type AddWeightBody = z.infer<typeof addWeightBodySchema>
