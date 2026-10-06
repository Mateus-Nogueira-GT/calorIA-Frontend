import { z } from 'zod'
import { localDateSchema, tzOffsetMinutesSchema } from '../../shared/local-date.js'

// ─── Requests ─────────────────────────────────────────────────────────────────

export const chatMessageBodySchema = z.object({
  message: z
    .string({ required_error: 'Mensagem é obrigatória' })
    .min(1, 'Mensagem não pode ser vazia')
    .max(2000, 'Mensagem muito longa (máx 2000 caracteres)'),
  /** ID da conversa para manter histórico. Null inicia uma nova conversa. */
  conversation_id: z.string().uuid().nullable().default(null),
  /** Data/fuso locais (I1) — o coach usa para montar o contexto do dia. */
  date: localDateSchema.optional(),
  tzOffsetMinutes: tzOffsetMinutesSchema.optional(),
})

/** Teto do corpo de POST /chat/transcribe (abaixo dos 4,5 MB da Vercel). */
export const TRANSCRIBE_BODY_LIMIT = Math.floor(3.5 * 1024 * 1024)

export const transcribeMimeTypes = ['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/webm'] as const

export const transcribeBodySchema = z.object({
  /** Áudio em base64 puro (sem prefixo `data:`). 60 s de m4a mono ≈ 250 KB. */
  audio: z
    .string({ required_error: 'Áudio é obrigatório' })
    .min(1, 'Áudio vazio')
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Áudio deve ser base64 puro, sem prefixo data:'),
  mimeType: z.enum(transcribeMimeTypes),
})

// ─── Responses ────────────────────────────────────────────────────────────────

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  created_at: z.string(),
})

export const chatResponseSchema = z.object({
  conversation_id: z.string().uuid(),
  message: chatMessageSchema,
  /** Indica se a IA coletou dados suficientes e gerou a dieta */
  diet_generated: z.boolean().default(false),
  /** ID da dieta gerada (presente quando diet_generated = true) */
  diet_id: z.string().uuid().nullable().default(null),
  /**
   * ID do job de geração assíncrona. Quando presente, o cliente deve fazer
   * polling em POST /diets/jobs/:id/step até status = completed.
   */
  diet_job_id: z.string().uuid().nullable().default(null),
})

export const transcribeResponseSchema = z.object({
  text: z.string(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>
export type ChatResponse = z.infer<typeof chatResponseSchema>
export type TranscribeBody = z.infer<typeof transcribeBodySchema>
export type TranscribeMimeType = (typeof transcribeMimeTypes)[number]
