import { z } from 'zod'
import { creditReceiptSchema } from '../credits/credits.schemas.js'

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
  calories: z.number().finite(),
  protein: z.number().finite(),
  carbs: z.number().finite(),
  fat: z.number().finite(),
  /** Peso estimado da quantidade visível, em gramas. Opcional para resultados legados. */
  weightGrams: z.number().finite().min(0.1).max(100_000).nullable().optional(),
  /** Fibra (g). null = sem dado (resultado em cache anterior à fibra). */
  fiber: z.number().finite().nullable(),
  /** Confiança da IA na estimativa, entre 0 e 1. */
  confidence: z.number().finite().min(0).max(1),
  /** OP3: confiança < 0.5 — o app pede para conferir os valores. */
  uncertain: z.boolean(),
})

// Alimentos distinguíveis têm itens próprios; preparação misturada pode ser um item.
export const scanResponseSchema = z.object({
  credit_receipt: creditReceiptSchema.optional(),
  items: z.array(scanItemSchema),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Structured output da OpenAI Vision ─────────────────────────────────────────
// Structured Outputs exige todos os campos obrigatórios.

export const visionItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weightGrams: z.number().finite().min(0.1).max(100_000),
  calories: z.number().finite(),
  protein: z.number().finite(),
  carbs: z.number().finite(),
  fat: z.number().finite(),
  fiber: z.number().finite(),
  confidence: z.number().finite(),
})

export const visionAnalysisSchema = z.object({
  is_food: z.boolean(),
  items: z.array(visionItemSchema).max(20),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalyzePhotoBody = z.infer<typeof analyzePhotoBodySchema>
export type ScanItem = z.infer<typeof scanItemSchema>
export type ScanResponse = z.infer<typeof scanResponseSchema>
export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>
