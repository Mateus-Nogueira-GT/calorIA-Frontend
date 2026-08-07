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
