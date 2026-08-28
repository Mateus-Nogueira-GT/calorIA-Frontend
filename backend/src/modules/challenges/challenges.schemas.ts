import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────────────

import { localDateSchema } from '../../shared/local-date.js'

export const memberStatusEnum = z.enum(['invited', 'active', 'quit', 'disqualified'])

// ─── Responses (camelCase — contrato com o frontend) ────────────────────────

export const challengeSchema = z.object({
  /** Derivado da data-fim (F3) — nenhum job muda status no banco. */
  finished: z.boolean(),
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  emoji: z.string(),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(), // YYYY-MM-DD
  participantCount: z.number().int(),
  metric: z.literal('streak'),
  joinedByMe: z.boolean(),
  inviteCode: z.string(),
})

export const leaderboardEntrySchema = z.object({
  rank: z.number().int(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    avatarEmoji: z.string().optional(),
  }),
  streak: z.number().int(),
  isMe: z.boolean(),
})

// Resposta do check-in (não consumida pelo front hoje; mantida para a UI futura).
export const challengeMemberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: memberStatusEnum,
  current_streak: z.number().int(),
  best_streak: z.number().int(),
  total_days: z.number().int(),
  last_check_in: z.string().nullable(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const createChallengeBodySchema = z
  .object({
    title: z.string().min(2).max(100),
    description: z.string().max(500).optional().default(''),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  })
  // L6: sem validação cruzada, endDate < startDate fazia durationDays cair para
  // 1 mas ends_at gravava a data passada — o desafio nascia já encerrado.
  // A UI atual sempre manda +7 dias, mas a API estava aberta.
  .refine((data) => Date.parse(data.endDate) >= Date.parse(data.startDate), {
    message: 'A data de término não pode ser anterior à de início',
    path: ['endDate'],
  })

/** Body opcional do check-in — data LOCAL do usuário (Workstream A / A8). */
export const checkInBodySchema = z.object({ date: localDateSchema.optional() }).nullish()

// ─── Types ────────────────────────────────────────────────────────────────────

export type Challenge = z.infer<typeof challengeSchema>
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>
export type ChallengeMember = z.infer<typeof challengeMemberSchema>
export type CreateChallengeBody = z.infer<typeof createChallengeBodySchema>
