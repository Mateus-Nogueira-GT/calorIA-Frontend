import type { FastifyInstance } from 'fastify'
import type { AppNotification, NotificationType } from './notifications.schemas.js'

interface DbRow {
  id: string
  type: NotificationType
  message: string
  target_id: string | null
  read_at: string | null
  created_at: string
  actor_id: string | null
  actor_full_name: string | null
  actor_username: string | null
}

function toNotification(row: DbRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    actor: {
      id: row.actor_id ?? 'system',
      name: row.actor_full_name ?? row.actor_username ?? 'CalorIA',
    },
    message: row.message,
    targetId: row.target_id,
    read: row.read_at !== null,
    createdAt: row.created_at,
  }
}

async function countUnread(fastify: FastifyInstance, userId: string): Promise<number> {
  const [{ count }] = await fastify.db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE user_id = ${userId} AND read_at IS NULL
  `
  return count
}

export async function listForUser(
  fastify: FastifyInstance,
  userId: string,
): Promise<{ items: AppNotification[]; unreadCount: number }> {
  const rows = await fastify.db<DbRow[]>`
    SELECT
      n.id, n.type, n.message, n.target_id,
      n.read_at::TEXT AS read_at,
      n.created_at::TEXT AS created_at,
      a.id AS actor_id, a.full_name AS actor_full_name, a.username AS actor_username
    FROM notifications n
    LEFT JOIN profiles a ON a.id = n.actor_id
    WHERE n.user_id = ${userId}
    ORDER BY n.created_at DESC
    LIMIT 50
  `
  return { items: rows.map(toNotification), unreadCount: await countUnread(fastify, userId) }
}

/** Marca como lidas: sem ids = todas; com ids = apenas as informadas. */
export async function markRead(
  fastify: FastifyInstance,
  userId: string,
  ids?: string[],
): Promise<{ unreadCount: number }> {
  if (ids && ids.length > 0) {
    await fastify.db`
      UPDATE notifications SET read_at = NOW()
      WHERE user_id = ${userId} AND read_at IS NULL AND id = ANY(${ids})
    `
  } else {
    await fastify.db`
      UPDATE notifications SET read_at = NOW()
      WHERE user_id = ${userId} AND read_at IS NULL
    `
  }
  return { unreadCount: await countUnread(fastify, userId) }
}

/**
 * Helper best-effort para outros módulos criarem notificações.
 * NUNCA deve derrubar a ação principal — o caller envolve em try/catch.
 * Não notifica o próprio usuário (actor === destinatário).
 */
export async function createNotification(
  fastify: FastifyInstance,
  params: {
    userId: string
    actorId: string
    type: NotificationType
    message: string
    targetId?: string | null
  },
): Promise<void> {
  if (params.userId === params.actorId) return
  await fastify.db`
    INSERT INTO notifications (user_id, actor_id, type, message, target_id)
    VALUES (${params.userId}, ${params.actorId}, ${params.type}, ${params.message}, ${params.targetId ?? null})
  `
}
