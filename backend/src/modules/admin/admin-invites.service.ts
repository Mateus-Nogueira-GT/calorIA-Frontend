import type { FastifyInstance } from 'fastify'
import type { inviteStatuses } from './admin.schemas.js'

/**
 * Convites com acompanhamento (spec 21/10, R3): quem resgatou, quando e quanto
 * a conta usou DEPOIS do resgate. Conta excluída: claimed_by vira NULL (FK SET
 * NULL) e o resgate some (CASCADE) — o item continua "used", sem nome e sem uso.
 */
export const INVITES_PAGE_SIZE = 50

export async function listInvites(
  f: FastifyInstance,
  query: { cursor?: string; status?: (typeof inviteStatuses)[number] },
) {
  const cursor = query.cursor ?? null
  const status = query.status ?? null
  const rows = await f.db.unsafe<Record<string, unknown>[]>(
    `SELECT * FROM (
       SELECT i.id, i.label,
              CASE WHEN i.status = 'active' AND i.expires_at <= now() THEN 'expired' ELSE i.status END AS status,
              i.grant_units, i.expires_at, i.created_at, i.claimed_by,
              p.full_name AS claimed_by_name,
              u.email::text AS claimed_by_email,
              wc.created_at AS claimed_at,
              coalesce(us.debited, 0)::int AS debited_units,
              coalesce(us.photos, 0)::int AS photos,
              coalesce(us.messages, 0)::int AS messages
         FROM credit_invites i
         LEFT JOIN credit_welcome_claims wc ON wc.invite_id = i.id
         LEFT JOIN profiles p ON p.id = i.claimed_by
         LEFT JOIN auth.users u ON u.id = i.claimed_by
         LEFT JOIN LATERAL (
           SELECT -sum(l.units) AS debited,
                  count(*) FILTER (WHERE o.type = 'photo') AS photos,
                  count(*) FILTER (WHERE o.type = 'chat') AS messages
             FROM credit_ledger l
             LEFT JOIN credit_operations o ON o.id = l.operation_id
            WHERE wc.created_at IS NOT NULL
              AND l.user_id = i.claimed_by
              AND l.kind = 'debit'
              AND l.created_at >= wc.created_at
         ) us ON true
        WHERE $1::uuid IS NULL
           OR (i.created_at, i.id) < (SELECT created_at, id FROM credit_invites WHERE id = $1::uuid)
     ) x
     WHERE $2::text IS NULL OR x.status = $2::text
     ORDER BY x.created_at DESC, x.id DESC
     LIMIT ${INVITES_PAGE_SIZE + 1}`,
    [cursor, status],
  )
  const page = rows.slice(0, INVITES_PAGE_SIZE)
  return {
    items: page.map(({ debited_units, photos, messages, ...invite }) => ({
      ...invite,
      usage_since_claim: {
        debited_units: Number(debited_units),
        photos: Number(photos),
        messages: Number(messages),
      },
    })),
    next_cursor: rows.length > INVITES_PAGE_SIZE ? String(page[page.length - 1].id) : null,
  }
}
