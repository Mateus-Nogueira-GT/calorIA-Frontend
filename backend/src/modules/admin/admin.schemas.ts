import { z } from 'zod'

export const metricsQuerySchema = z.object({
  /** Janela de análise. 30 dias cobre o mês corrente sem pesar a query. */
  days: z.coerce.number().int().min(1).max(365).default(30),
})

export const adminMetricsSchema = z.object({
  periodDays: z.number().int(),
  users: z.object({
    total: z.number().int(),
    new7d: z.number().int(),
    newInPeriod: z.number().int(),
    active7d: z.number().int(),
    withActiveDiet: z.number().int(),
  }),
  diets: z.object({
    generatedInPeriod: z.number().int(),
    jobsCompleted: z.number().int(),
    jobsFailed: z.number().int(),
    jobsRunning: z.number().int(),
    successRate: z.number(),
  }),
  engagement: z.object({
    mealsLogged7d: z.number().int(),
    avgStreak: z.number(),
    maxStreak: z.number().int(),
    postsInPeriod: z.number().int(),
    commentsInPeriod: z.number().int(),
    activeChallenges: z.number().int(),
  }),
  ai: z.object({
    totalCalls: z.number().int(),
    byFeature: z.array(
      z.object({
        feature: z.string(),
        calls: z.number().int(),
        totalTokens: z.number().int(),
      }),
    ),
    topUsers: z.array(
      z.object({
        userId: z.string().nullable(),
        name: z.string(),
        totalTokens: z.number().int(),
      }),
    ),
  }),
})

export const errorSchema = z.object({ error: z.string(), message: z.string() })

export type AdminMetrics = z.infer<typeof adminMetricsSchema>
export type MetricsQuery = z.infer<typeof metricsQuerySchema>

// ─── Painel admin 21/10: visão geral, usuários e convites ───────────────────

export const periodQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => d === 7 || d === 30 || d === 90, 'Período deve ser 7, 30 ou 90 dias')
    .default(30),
})

const metricSchema = z.object({ value: z.number(), previous: z.number() })
export type Metric = z.infer<typeof metricSchema>

export const adminOverviewSchema = z.object({
  periodDays: z.number().int(),
  users: z.object({
    total: z.number().int(),
    newInPeriod: metricSchema,
    active7d: z.number().int(),
    activeInPeriod: metricSchema,
    withActiveDiet: z.number().int(),
  }),
  usage: z.object({
    photos: metricSchema,
    textMessages: metricSchema,
    voiceMessages: metricSchema,
    mealsLogged: metricSchema,
    dietsCompleted: metricSchema,
    dietsFailed: metricSchema,
  }),
  credits: z.object({
    welcomeAutoUnits: metricSchema,
    welcomeInviteUnits: metricSchema,
    consumedPhotoUnits: metricSchema,
    consumedMessageUnits: metricSchema,
    totalBalanceUnits: z.number(),
    zeroBalanceAccounts: z.number().int(),
  }),
  invites: z.object({
    created: metricSchema,
    redeemed: metricSchema,
    redemptionRate: z.number(),
    expiredUnused: z.number().int(),
    revoked: z.number().int(),
  }),
  ai: z.object({
    byFeature: z.array(
      z.object({
        feature: z.string(),
        calls: z.number().int(),
        totalTokens: z.number(),
        estimatedUsd: z.number().nullable(),
      }),
    ),
    totalEstimatedUsd: z.number(),
  }),
})
export type AdminOverview = z.infer<typeof adminOverviewSchema>

export const adminUserSorts = ['recent', 'active', 'low_balance', 'ai_usage'] as const
export const usersQuerySchema = periodQuerySchema.extend({
  q: z.string().trim().min(2, 'Busca precisa de pelo menos 2 caracteres').max(100).optional(),
  sort: z.enum(adminUserSorts).default('recent'),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,40}$/)
    .optional(),
})
export type UsersQuery = z.infer<typeof usersQuerySchema>

export const adminUserRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  created_at: z.string(),
  last_activity_at: z.string().nullable(),
  balance_units: z.number(),
  photos: z.number().int(),
  messages: z.number().int(),
  has_active_diet: z.boolean(),
  current_streak: z.number().int(),
  joined_by_invite: z.boolean(),
})
export type AdminUserRow = z.infer<typeof adminUserRowSchema>

export const adminUsersResponseSchema = z.object({
  items: z.array(adminUserRowSchema),
  next_cursor: z.string().nullable(),
})

export const inviteStatuses = ['active', 'used', 'expired', 'revoked'] as const
export const invitesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  status: z.enum(inviteStatuses).optional(),
})
