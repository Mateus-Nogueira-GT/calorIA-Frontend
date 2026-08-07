import type { FastifyInstance } from 'fastify'
import type { AdminMetrics } from './admin.schemas.js'

/** Taxa de sucesso dos jobs. Denominador zero → 0 (sem NaN na UI). */
export function successRate(completed: number, failed: number): number {
  const total = completed + failed
  if (total === 0) return 0
  return Math.round((completed / total) * 100) / 100
}

async function getUserMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['users']> {
  const [row] = await fastify.db<
    {
      total: number
      new_7d: number
      new_period: number
      active_7d: number
      with_active_diet: number
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM profiles) AS total,
      (SELECT COUNT(*)::INT FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days') AS new_7d,
      (SELECT COUNT(*)::INT FROM profiles
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS new_period,
      (SELECT COUNT(*)::INT FROM (
         -- Ativo = registrou refeição, concluiu refeição do plano ou fez check-in
         SELECT user_id FROM meals WHERE meal_date >= CURRENT_DATE - 7
         UNION
         SELECT d.user_id
           FROM diet_meals dm
           JOIN diet_days dd ON dd.id = dm.diet_day_id
           JOIN diets d      ON d.id  = dd.diet_id
          WHERE dm.completed_at >= NOW() - INTERVAL '7 days'
         UNION
         -- challenge_days guarda member_id; o user_id vem de challenge_members
         SELECT cm.user_id
           FROM challenge_days cd
           JOIN challenge_members cm ON cm.id = cd.member_id
          WHERE cd.check_date >= CURRENT_DATE - 7
       ) AS ativos) AS active_7d,
      (SELECT COUNT(DISTINCT user_id)::INT FROM diets WHERE status = 'active') AS with_active_diet
  `
  return {
    total: row.total,
    new7d: row.new_7d,
    newInPeriod: row.new_period,
    active7d: row.active_7d,
    withActiveDiet: row.with_active_diet,
  }
}

async function getDietMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['diets']> {
  const [row] = await fastify.db<
    { generated: number; completed: number; failed: number; running: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM diets
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS generated,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status = 'completed'
          AND created_at >= NOW() - (${days} || ' days')::interval) AS completed,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status = 'failed'
          AND created_at >= NOW() - (${days} || ' days')::interval) AS failed,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status IN ('pending', 'running')) AS running
  `
  return {
    generatedInPeriod: row.generated,
    jobsCompleted: row.completed,
    jobsFailed: row.failed,
    jobsRunning: row.running,
    successRate: successRate(row.completed, row.failed),
  }
}

async function getEngagementMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['engagement']> {
  const [row] = await fastify.db<
    {
      meals_7d: number
      avg_streak: string | null
      max_streak: number | null
      posts: number
      comments: number
      challenges: number
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM meals WHERE meal_date >= CURRENT_DATE - 7) AS meals_7d,
      -- Média só entre quem tem streak: incluir zerados dilui a métrica.
      (SELECT AVG(current_streak) FROM streaks WHERE current_streak > 0) AS avg_streak,
      (SELECT MAX(current_streak) FROM streaks) AS max_streak,
      (SELECT COUNT(*)::INT FROM feed_posts
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS posts,
      (SELECT COUNT(*)::INT FROM post_comments
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS comments,
      (SELECT COUNT(*)::INT FROM challenges
        WHERE COALESCE(ends_at, starts_at + (duration_days || ' days')::interval)::DATE
              >= CURRENT_DATE) AS challenges
  `
  return {
    mealsLogged7d: row.meals_7d,
    avgStreak: row.avg_streak ? Math.round(Number(row.avg_streak) * 10) / 10 : 0,
    maxStreak: row.max_streak ?? 0,
    postsInPeriod: row.posts,
    commentsInPeriod: row.comments,
    activeChallenges: row.challenges,
  }
}

async function getAiMetrics(fastify: FastifyInstance, days: number): Promise<AdminMetrics['ai']> {
  const byFeature = await fastify.db<{ feature: string; calls: number; total_tokens: number }[]>`
    SELECT feature,
           COUNT(*)::INT AS calls,
           COALESCE(SUM(total_tokens), 0)::INT AS total_tokens
      FROM ai_usage
     WHERE created_at >= NOW() - (${days} || ' days')::interval
     GROUP BY feature
     ORDER BY total_tokens DESC
  `

  const topUsers = await fastify.db<
    { user_id: string | null; name: string | null; total_tokens: number }[]
  >`
    SELECT a.user_id,
           COALESCE(p.full_name, p.username) AS name,
           COALESCE(SUM(a.total_tokens), 0)::INT AS total_tokens
      FROM ai_usage a
      LEFT JOIN profiles p ON p.id = a.user_id
     WHERE a.created_at >= NOW() - (${days} || ' days')::interval
     GROUP BY a.user_id, p.full_name, p.username
     ORDER BY total_tokens DESC
     LIMIT 5
  `

  return {
    totalCalls: byFeature.reduce((sum, f) => sum + f.calls, 0),
    byFeature: byFeature.map((f) => ({
      feature: f.feature,
      calls: f.calls,
      totalTokens: f.total_tokens,
    })),
    topUsers: topUsers.map((u) => ({
      userId: u.user_id,
      name: u.name ?? 'Usuário',
      totalTokens: u.total_tokens,
    })),
  }
}

/** Os 4 blocos são independentes — rodam em paralelo. */
export async function getAdminMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics> {
  const [users, diets, engagement, ai] = await Promise.all([
    getUserMetrics(fastify, days),
    getDietMetrics(fastify, days),
    getEngagementMetrics(fastify, days),
    getAiMetrics(fastify, days),
  ])
  return { periodDays: days, users, diets, engagement, ai }
}
