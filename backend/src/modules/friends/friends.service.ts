import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { createNotification } from '../notifications/notifications.service.js'
import type { Friend, FriendRequest, UserSearchResult } from './friends.schemas.js'

// ─── Busca de usuários ────────────────────────────────────────────────────────

export async function searchUsers(
  fastify: FastifyInstance,
  userId: string,
  query: string,
): Promise<UserSearchResult[]> {
  const rows = await fastify.db<
    {
      id: string
      username: string | null
      full_name: string | null
      avatar_url: string | null
      status: string | null
      requester_id: string | null
    }[]
  >`
    SELECT p.id, p.username, p.full_name, p.avatar_url, f.status, f.requester_id
    FROM profiles p
    LEFT JOIN friendships f
      ON (f.requester_id = p.id AND f.addressee_id = ${userId})
      OR (f.addressee_id = p.id AND f.requester_id = ${userId})
    WHERE p.id <> ${userId}
      AND (p.username ILIKE ${`%${query}%`} OR p.full_name ILIKE ${`%${query}%`})
    ORDER BY p.username
    LIMIT 20
  `

  return rows.map((row) => {
    let relationship: UserSearchResult['relationship'] = 'none'
    if (row.status === 'accepted') relationship = 'friends'
    else if (row.status === 'pending')
      relationship = row.requester_id === userId ? 'pending_sent' : 'pending_received'

    return {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      relationship,
    }
  })
}

// ─── Pedidos de amizade ───────────────────────────────────────────────────────

export async function sendFriendRequest(
  fastify: FastifyInstance,
  userId: string,
  username: string,
): Promise<{ id: string }> {
  const [target] = await fastify.db<{ id: string }[]>`
    SELECT id FROM profiles WHERE username = ${username}
  `
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
  if (target.id === userId)
    throw new AppError(400, 'INVALID_TARGET', 'Você não pode adicionar a si mesmo')

  const [existing] = await fastify.db<{ id: string; status: string }[]>`
    SELECT id, status FROM friendships
    WHERE (requester_id = ${userId} AND addressee_id = ${target.id})
       OR (requester_id = ${target.id} AND addressee_id = ${userId})
  `
  if (existing) {
    if (existing.status === 'accepted')
      throw new AppError(409, 'ALREADY_FRIENDS', 'Vocês já são amigos')
    if (existing.status === 'pending')
      throw new AppError(409, 'REQUEST_PENDING', 'Já existe um pedido pendente')
    throw new AppError(409, 'BLOCKED', 'Não é possível enviar pedido para este usuário')
  }

  const [created] = await fastify.db<{ id: string }[]>`
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (${userId}, ${target.id}, 'pending')
    RETURNING id
  `

  // E4 da spec: sem isso o destinatário só descobria o pedido abrindo a tela
  // de pedidos por conta própria. Best-effort — nunca derruba o pedido.
  try {
    await createNotification(fastify, {
      userId: target.id,
      actorId: userId,
      type: 'friend_request',
      message: 'enviou um pedido de amizade',
      targetId: created.id,
    })
  } catch (err) {
    fastify.log.warn(err, 'Falha ao criar notificação de pedido de amizade')
  }

  return created
}

export async function respondFriendRequest(
  fastify: FastifyInstance,
  userId: string,
  requestId: string,
  action: 'accept' | 'reject',
): Promise<{ status: string }> {
  const [request] = await fastify.db<{ id: string; status: string; requester_id: string }[]>`
    SELECT id, status, requester_id FROM friendships
    WHERE id = ${requestId} AND addressee_id = ${userId}
  `
  if (!request) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Pedido de amizade não encontrado')
  if (request.status !== 'pending')
    throw new AppError(409, 'REQUEST_ALREADY_HANDLED', 'Este pedido já foi respondido')

  if (action === 'reject') {
    await fastify.db`DELETE FROM friendships WHERE id = ${requestId}`
    return { status: 'rejected' }
  }

  await fastify.db`UPDATE friendships SET status = 'accepted', updated_at = NOW() WHERE id = ${requestId}`

  try {
    await createNotification(fastify, {
      userId: request.requester_id,
      actorId: userId,
      type: 'friend_accepted',
      message: 'aceitou seu pedido de amizade',
      targetId: requestId,
    })
  } catch (err) {
    fastify.log.warn(err, 'Falha ao criar notificação de amizade aceita')
  }

  return { status: 'accepted' }
}

export async function removeFriendship(
  fastify: FastifyInstance,
  userId: string,
  friendshipId: string,
): Promise<void> {
  const result = await fastify.db`
    DELETE FROM friendships
    WHERE id = ${friendshipId} AND (requester_id = ${userId} OR addressee_id = ${userId})
  `
  if (result.count === 0) throw new AppError(404, 'FRIENDSHIP_NOT_FOUND', 'Amizade não encontrada')
}

// ─── Listagens ────────────────────────────────────────────────────────────────

export async function listFriends(fastify: FastifyInstance, userId: string): Promise<Friend[]> {
  return fastify.db<Friend[]>`
    SELECT
      f.id AS friendship_id,
      p.id, p.username, p.full_name, p.avatar_url,
      s.current_streak
    FROM friendships f
    JOIN profiles p ON p.id = CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN streaks s ON s.user_id = p.id
    WHERE f.status = 'accepted' AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
    ORDER BY p.username
  `
}

export async function listPendingRequests(
  fastify: FastifyInstance,
  userId: string,
): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const incoming = await fastify.db<FriendRequest[]>`
    SELECT
      f.id, f.status, f.created_at::TEXT AS created_at,
      json_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url) AS "user"
    FROM friendships f
    JOIN profiles p ON p.id = f.requester_id
    WHERE f.addressee_id = ${userId} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `

  const outgoing = await fastify.db<FriendRequest[]>`
    SELECT
      f.id, f.status, f.created_at::TEXT AS created_at,
      json_build_object('id', p.id, 'username', p.username, 'full_name', p.full_name, 'avatar_url', p.avatar_url) AS "user"
    FROM friendships f
    JOIN profiles p ON p.id = f.addressee_id
    WHERE f.requester_id = ${userId} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `

  return { incoming, outgoing }
}
