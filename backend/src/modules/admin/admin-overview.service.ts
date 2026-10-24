import type { FastifyInstance } from 'fastify'
import { estimateUsd } from '../../shared/ai-prices.js'
import type { AdminOverview, Metric } from './admin.schemas.js'

/**
 * Visão geral do painel admin (spec 21/10, R1/R4). Cada métrica de fluxo vem
 * com o valor do período e do período anterior de mesmo tamanho:
 *   atual    = [agora − d, agora)
 *   anterior = [agora − 2d, agora − d)
 * Créditos em UNIDADES (5 = 1 crédito).
 */
type Row = Record<string, number | string | null>

const n = (v: number | string | null | undefined): number => Number(v ?? 0)
const metric = (row: Row, key: string): Metric => ({
  value: n(row[`${key}_cur`]),
  previous: n(row[`${key}_prev`]),
})

/** Atividade = refeição registrada, uso de IA ou operação de crédito (R4). */
const ACTIVITY_SQL = `
  SELECT user_id, created_at AS at FROM meals
  UNION ALL SELECT user_id, created_at FROM ai_usage WHERE user_id IS NOT NULL
  UNION ALL SELECT user_id, created_at FROM credit_operations WHERE user_id IS NOT NULL`

async function users(f: FastifyInstance, days: number): Promise<AdminOverview['users']> {
  const [row] = await f.db.unsafe<Row[]>(
    `WITH w AS (SELECT now() - make_interval(days => $1) AS cur, now() - make_interval(days => $1 * 2) AS prev),
          act AS (${ACTIVITY_SQL})
     SELECT
       (SELECT count(*) FROM profiles) AS total,
       (SELECT count(*) FROM profiles, w WHERE created_at >= w.cur) AS new_cur,
       (SELECT count(*) FROM profiles, w WHERE created_at >= w.prev AND created_at < w.cur) AS new_prev,
       (SELECT count(DISTINCT user_id) FROM act WHERE at >= now() - interval '7 days') AS active7d,
       (SELECT count(DISTINCT user_id) FROM act, w WHERE at >= w.cur) AS active_cur,
       (SELECT count(DISTINCT user_id) FROM act, w WHERE at >= w.prev AND at < w.cur) AS active_prev,
       (SELECT count(DISTINCT user_id) FROM diets WHERE status = 'active') AS with_active_diet`,
    [days],
  )
  return {
    total: n(row.total),
    newInPeriod: metric(row, 'new'),
    active7d: n(row.active7d),
    activeInPeriod: metric(row, 'active'),
    withActiveDiet: n(row.with_active_diet),
  }
}

async function usage(f: FastifyInstance, days: number): Promise<AdminOverview['usage']> {
  const [row] = await f.db.unsafe<Row[]>(
    `WITH w AS (SELECT now() - make_interval(days => $1) AS cur, now() - make_interval(days => $1 * 2) AS prev)
     SELECT
       (SELECT count(*) FILTER (WHERE feature = 'vision' AND created_at >= w.cur) FROM ai_usage) AS photos_cur,
       (SELECT count(*) FILTER (WHERE feature = 'vision' AND created_at >= w.prev AND created_at < w.cur) FROM ai_usage) AS photos_prev,
       (SELECT count(*) FILTER (WHERE feature = 'chat' AND created_at >= w.cur) FROM ai_usage) AS chat_cur,
       (SELECT count(*) FILTER (WHERE feature = 'chat' AND created_at >= w.prev AND created_at < w.cur) FROM ai_usage) AS chat_prev,
       (SELECT count(*) FILTER (WHERE feature = 'transcribe' AND created_at >= w.cur) FROM ai_usage) AS voice_cur,
       (SELECT count(*) FILTER (WHERE feature = 'transcribe' AND created_at >= w.prev AND created_at < w.cur) FROM ai_usage) AS voice_prev,
       (SELECT count(*) FILTER (WHERE created_at >= w.cur) FROM meals) AS meals_cur,
       (SELECT count(*) FILTER (WHERE created_at >= w.prev AND created_at < w.cur) FROM meals) AS meals_prev,
       (SELECT count(*) FILTER (WHERE status = 'completed' AND updated_at >= w.cur) FROM diet_jobs) AS done_cur,
       (SELECT count(*) FILTER (WHERE status = 'completed' AND updated_at >= w.prev AND updated_at < w.cur) FROM diet_jobs) AS done_prev,
       (SELECT count(*) FILTER (WHERE status = 'failed' AND updated_at >= w.cur) FROM diet_jobs) AS failed_cur,
       (SELECT count(*) FILTER (WHERE status = 'failed' AND updated_at >= w.prev AND updated_at < w.cur) FROM diet_jobs) AS failed_prev
     FROM w`,
    [days],
  )
  const voice = metric(row, 'voice')
  const chat = metric(row, 'chat')
  return {
    photos: metric(row, 'photos'),
    // Aproximação (R4): cada mensagem de voz passa por uma transcrição.
    textMessages: {
      value: Math.max(chat.value - voice.value, 0),
      previous: Math.max(chat.previous - voice.previous, 0),
    },
    voiceMessages: voice,
    mealsLogged: metric(row, 'meals'),
    dietsCompleted: metric(row, 'done'),
    dietsFailed: metric(row, 'failed'),
  }
}

async function credits(f: FastifyInstance, days: number): Promise<AdminOverview['credits']> {
  const [row] = await f.db.unsafe<Row[]>(
    `WITH w AS (SELECT now() - make_interval(days => $1) AS cur, now() - make_interval(days => $1 * 2) AS prev),
          l AS (
            SELECT l.kind, l.units, l.invite_id, l.created_at, o.type
              FROM credit_ledger l LEFT JOIN credit_operations o ON o.id = l.operation_id
          )
     SELECT
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'welcome' AND invite_id IS NULL AND created_at >= w.cur), 0) FROM l) AS auto_cur,
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'welcome' AND invite_id IS NULL AND created_at >= w.prev AND created_at < w.cur), 0) FROM l) AS auto_prev,
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'welcome' AND invite_id IS NOT NULL AND created_at >= w.cur), 0) FROM l) AS invite_cur,
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'welcome' AND invite_id IS NOT NULL AND created_at >= w.prev AND created_at < w.cur), 0) FROM l) AS invite_prev,
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'grant' AND created_at >= w.cur), 0) FROM l) AS manual_cur,
       (SELECT coalesce(sum(units) FILTER (WHERE kind = 'grant' AND created_at >= w.prev AND created_at < w.cur), 0) FROM l) AS manual_prev,
       (SELECT coalesce(-sum(units) FILTER (WHERE kind = 'debit' AND type = 'photo' AND created_at >= w.cur), 0) FROM l) AS photo_cur,
       (SELECT coalesce(-sum(units) FILTER (WHERE kind = 'debit' AND type = 'photo' AND created_at >= w.prev AND created_at < w.cur), 0) FROM l) AS photo_prev,
       (SELECT coalesce(-sum(units) FILTER (WHERE kind = 'debit' AND type = 'chat' AND created_at >= w.cur), 0) FROM l) AS message_cur,
       (SELECT coalesce(-sum(units) FILTER (WHERE kind = 'debit' AND type = 'chat' AND created_at >= w.prev AND created_at < w.cur), 0) FROM l) AS message_prev,
       (SELECT coalesce(sum(balance_units), 0) FROM credit_wallets) AS total_balance,
       (SELECT count(*) FROM profiles p LEFT JOIN credit_wallets cw ON cw.user_id = p.id
         WHERE coalesce(cw.balance_units - cw.reserved_units, 0) <= 0) AS zero_balance
     FROM w`,
    [days],
  )
  return {
    welcomeAutoUnits: metric(row, 'auto'),
    welcomeInviteUnits: metric(row, 'invite'),
    manualUnits: metric(row, 'manual'),
    consumedPhotoUnits: metric(row, 'photo'),
    consumedMessageUnits: metric(row, 'message'),
    totalBalanceUnits: n(row.total_balance),
    zeroBalanceAccounts: n(row.zero_balance),
  }
}

async function invites(f: FastifyInstance, days: number): Promise<AdminOverview['invites']> {
  const [row] = await f.db.unsafe<Row[]>(
    `WITH w AS (SELECT now() - make_interval(days => $1) AS cur, now() - make_interval(days => $1 * 2) AS prev)
     SELECT
       (SELECT count(*) FILTER (WHERE created_at >= w.cur) FROM credit_invites) AS created_cur,
       (SELECT count(*) FILTER (WHERE created_at >= w.prev AND created_at < w.cur) FROM credit_invites) AS created_prev,
       (SELECT count(*) FILTER (WHERE created_at >= w.cur) FROM credit_welcome_claims) AS redeemed_cur,
       (SELECT count(*) FILTER (WHERE created_at >= w.prev AND created_at < w.cur) FROM credit_welcome_claims) AS redeemed_prev,
       (SELECT count(*) FILTER (WHERE status = 'used' AND created_at >= w.cur) FROM credit_invites) AS used_of_created,
       (SELECT count(*) FILTER (WHERE status = 'active' AND expires_at <= now() AND expires_at >= w.cur) FROM credit_invites) AS expired_unused,
       (SELECT count(*) FILTER (WHERE status = 'revoked' AND created_at >= w.cur) FROM credit_invites) AS revoked
     FROM w`,
    [days],
  )
  const created = metric(row, 'created')
  return {
    created,
    redeemed: metric(row, 'redeemed'),
    redemptionRate:
      created.value === 0 ? 0 : Math.round((n(row.used_of_created) / created.value) * 100) / 100,
    expiredUnused: n(row.expired_unused),
    revoked: n(row.revoked),
  }
}

async function ai(f: FastifyInstance, days: number): Promise<AdminOverview['ai']> {
  const rows = await f.db.unsafe<Row[]>(
    `SELECT feature, model, count(*) AS calls,
            coalesce(sum(prompt_tokens), 0) AS prompt_tokens,
            coalesce(sum(completion_tokens), 0) AS completion_tokens,
            coalesce(sum(total_tokens), 0) AS total_tokens
       FROM ai_usage
      WHERE created_at >= now() - make_interval(days => $1)
      GROUP BY feature, model`,
    [days],
  )
  const byFeature = new Map<
    string,
    { feature: string; calls: number; totalTokens: number; estimatedUsd: number | null }
  >()
  for (const r of rows) {
    const feature = String(r.feature)
    const current = byFeature.get(feature) ?? {
      feature,
      calls: 0,
      totalTokens: 0,
      estimatedUsd: 0 as number | null,
    }
    const cost = estimateUsd(String(r.model), n(r.prompt_tokens), n(r.completion_tokens))
    current.calls += n(r.calls)
    current.totalTokens += n(r.total_tokens)
    // Um modelo sem preço deixa o recurso sem estimativa (não inventa zero).
    current.estimatedUsd =
      current.estimatedUsd === null || cost === null ? null : current.estimatedUsd + cost
    byFeature.set(feature, current)
  }
  const list = [...byFeature.values()].sort((a, b) => b.totalTokens - a.totalTokens)
  return {
    byFeature: list,
    totalEstimatedUsd: list.reduce((sum, item) => sum + (item.estimatedUsd ?? 0), 0),
  }
}

/** Os blocos são independentes — rodam em paralelo. */
export async function getOverview(f: FastifyInstance, days: number): Promise<AdminOverview> {
  const [u, us, c, i, a] = await Promise.all([
    users(f, days),
    usage(f, days),
    credits(f, days),
    invites(f, days),
    ai(f, days),
  ])
  return { periodDays: days, users: u, usage: us, credits: c, invites: i, ai: a }
}
