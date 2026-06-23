import { z } from 'zod'

// ─── Requests ─────────────────────────────────────────────────────────────────

export const analyzePhotoBodySchema = z.object({
  /** Imagem em data URL base64 (ex: "data:image/jpeg;base64,...."). */
  image: z
    .string()
    .startsWith('data:image/', 'Imagem deve ser um data URL base64')
    .max(8_000_000, 'Imagem muito grande — reduza a resolução antes de enviar'),
})

// ─── Responses (contrato com o frontend) ───────────────────────────────────────

export const scanResultSchema = z.object({
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  /** Confiança da IA na estimativa, entre 0 e 1. */
  confidence: z.number().min(0).max(1),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Structured output da OpenAI Vision ─────────────────────────────────────────
// Structured Outputs exige todos os campos obrigatórios.

export const visionAnalysisSchema = z.object({
  is_food: z.boolean(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  confidence: z.number(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalyzePhotoBody = z.infer<typeof analyzePhotoBodySchema>
export type ScanResult = z.infer<typeof scanResultSchema>
export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>
