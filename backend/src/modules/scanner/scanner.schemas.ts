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

export const scanItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  /** Confiança da IA na estimativa, entre 0 e 1. */
  confidence: z.number().min(0).max(1),
})

// A IA hoje retorna 1 item por foto, mas o contrato já é uma lista para abrir
// caminho a múltiplos itens por foto no futuro (e o front edita item a item).
export const scanResponseSchema = z.object({
  items: z.array(scanItemSchema),
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
export type ScanItem = z.infer<typeof scanItemSchema>
export type ScanResponse = z.infer<typeof scanResponseSchema>
export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>
