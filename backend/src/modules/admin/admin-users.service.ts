import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import type { AdminUserRow, UsersQuery } from './admin.schemas.js'

/**
 * Lista de usuários do painel admin (spec 21/10, R2). Só dados de conta e
 * contagens de uso — nada de saúde (peso, condições), refeições ou conversas.
 */
export const USERS_PAGE_SIZE = 25

/** Ordenações em whitelist: o texto entra no SQL, então nunca vem do cliente. */
const ORDER_BY: Record<UsersQuery['sort'], string> = {
  recent: 'created_at DESC',
  active: 'last_activity_at DESC NULLS LAST',
  low_balance: 'balance_units ASC',
  ai_usage: 'ai_tokens DESC',
}

/** Cursor opaco = offset em base64url ("o:<n>"). Ordem estável pelo desempate por id. */
export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url')
}
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  const match = Buffer.from(cursor, 'base64url')
    .toString()
    .match(/^o:(\d{1,7})$/)
  if (!match) throw new AppError(400, 'INVALID_CURSOR', 'Página inválida.')
  return Number(match[1])
}

/** Termo de busca literal: %, _ e \ não viram curinga no ILIKE. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

type DbRow = Omit<AdminUserRow, 'created_at' | 'last_activity_at'> & {
  created_at: Date
  last_activity_at: Date | null
  ai_tokens: number
}

export async function listUsers(
  f: FastifyInstance,
  adminId: string,
  query: UsersQuery,
): Promise<{ items: AdminUserRow[]; next_cursor: string | null }> {
  const offset = decodeCursor(query.cursor)
  const pattern = query.q ? likePattern(query.q) : null
  const rows = await f.db.unsafe<DbRow[]>(
    `WITH act AS (
       SELECT user_id, created_at AS at FROM meals
       UNION ALL SELECT user_id, created_at FROM ai_usage WHERE user_id IS NOT NULL
       UNION ALL SELECT user_id, created_at FROM credit_operations WHERE user_id IS NOT NULL
     ),
     base AS (
       SELECT p.id,
              p.full_name AS name,
              u.email::text AS email,
              p.created_at,
              la.last_at AS last_activity_at,
              coalesce(cw.balance_units - cw.reserved_units, 0)::int AS balance_units,
              coalesce(ai.photos, 0)::int AS photos,
              coalesce(ai.messages, 0)::int AS messages,
              coalesce(ai.tokens, 0)::bigint AS ai_tokens,
              EXISTS (SELECT 1 FROM diets d WHERE d.user_id = p.id AND d.status = 'active') AS has_active_diet,
              coalesce((SELECT max(s.current_streak) FROM streaks s WHERE s.user_id = p.id), 0)::int AS current_streak,
              EXISTS (SELECT 1 FROM credit_welcome_claims wc WHERE wc.user_id = p.id) AS joined_by_invite
         FROM profiles p
         LEFT JOIN auth.users u ON u.id = p.id
         LEFT JOIN credit_wallets cw ON cw.user_id = p.id
         LEFT JOIN (
           SELECT user_id,
                  count(*) FILTER (WHERE feature = 'vision') AS photos,
                  count(*) FILTER (WHERE feature = 'chat') AS messages,
                  sum(total_tokens) AS tokens
             FROM ai_usage
            WHERE created_at >= now() - make_interval(days => $1)
            GROUP BY user_id
         ) ai ON ai.user_id = p.id
         LEFT JOIN (SELECT user_id, max(at) AS last_at FROM act GROUP BY user_id) la ON la.user_id = p.id
        WHERE $2::text IS NULL
           OR p.full_name ILIKE $2 ESCAPE '\\'
           OR u.email::text ILIKE $2 ESCAPE '\\'
     )
     SELECT * FROM base
      ORDER BY ${ORDER_BY[query.sort]}, id ASC
      LIMIT ${USERS_PAGE_SIZE + 1} OFFSET $3`,
    [query.days, pattern, offset],
  )

  if (query.q) {
    // Auditoria da busca (R6): quem buscou, o termo e quantos resultados — sem os resultados.
    f.log.info(
      {
        admin_user_search: { adminId, q: query.q, results: Math.min(rows.length, USERS_PAGE_SIZE) },
      },
      'admin_user_search',
    )
  }

  const page = rows.slice(0, USERS_PAGE_SIZE)
  return {
    items: page.map(({ ai_tokens: _tokens, ...row }) => ({
      ...row,
      balance_units: Number(row.balance_units),
      photos: Number(row.photos),
      messages: Number(row.messages),
      current_streak: Number(row.current_streak),
      created_at: new Date(row.created_at).toISOString(),
      last_activity_at: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
    })),
    next_cursor: rows.length > USERS_PAGE_SIZE ? encodeCursor(offset + USERS_PAGE_SIZE) : null,
  }
}
