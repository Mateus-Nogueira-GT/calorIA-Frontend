import { z } from 'zod'

// ─── Requests ────────────────────────────────────────────────────────────────

export const registerBodySchema = z.object({
  name: z
    .string({ required_error: 'Nome é obrigatório' })
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100),
  email: z.string({ required_error: 'Email é obrigatório' }).email('Email inválido'),
  password: z
    .string({ required_error: 'Senha é obrigatória' })
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .max(100),
})

export const loginBodySchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

export const refreshBodySchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token é obrigatório'),
})

// ─── Responses ───────────────────────────────────────────────────────────────

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
})

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal('bearer'),
  expires_in: z.number(),
  user: authUserSchema,
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Types ───────────────────────────────────────────────────────────────────

export type RegisterBody = z.infer<typeof registerBodySchema>
export type LoginBody = z.infer<typeof loginBodySchema>
export type RefreshBody = z.infer<typeof refreshBodySchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
