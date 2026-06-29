import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { createNotification } from '../notifications/notifications.service.js'
import type { Comment, FeedPost, PostType } from './feed.schemas.js'

interface DbAuthor {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

async function assertPostVisible(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<{ id: string; user_id: string }> {
  const [post] = await fastify.db<{ id: string; user_id: string }[]>`
    SELECT p.id, p.user_id
    FROM feed_posts p
    WHERE p.id = ${postId}
      AND (p.user_id = ${userId} OR are_friends(${userId}, p.user_id))
  `
  if (!post) throw new AppError(404, 'POST_NOT_FOUND', 'Post não encontrado')
  return post
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function createPost(
  fastify: FastifyInstance,
  userId: string,
  content: string,
  type: PostType = 'custom',
  metadata: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const metadataJson = JSON.stringify(metadata)
  const [created] = await fastify.db<{ id: string }[]>`
    INSERT INTO feed_posts (user_id, type, content, metadata)
    VALUES (${userId}, ${type}, ${content}, ${metadataJson}::jsonb)
    RETURNING id
  `
  return created
}

/** Helper para outros módulos publicarem posts automáticos (streak, desafio, dieta gerada). */
export async function createSystemPost(
  fastify: FastifyInstance,
  userId: string,
  type: PostType,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await createPost(fastify, userId, content, type, metadata)
}

export async function getFeed(
  fastify: FastifyInstance,
  userId: string,
  limit: number,
  before?: string,
): Promise<FeedPost[]> {
  const rows = await fastify.db<
    {
      id: string
      type: PostType
      content: string | null
      metadata: Record<string, unknown>
      likes_count: number
      comments_count: number
      created_at: string
      liked_by_me: boolean
      author: DbAuthor
    }[]
  >`
    SELECT
      p.id, p.type, p.content, p.metadata,
      p.likes_count, p.comments_count,
      p.created_at::TEXT AS created_at,
      EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${userId}) AS liked_by_me,
      json_build_object('id', a.id, 'username', a.username, 'full_name', a.full_name, 'avatar_url', a.avatar_url) AS author
    FROM feed_posts p
    JOIN profiles a ON a.id = p.user_id
    WHERE (p.user_id = ${userId} OR are_friends(${userId}, p.user_id))
      ${before ? fastify.db`AND p.created_at < ${before}` : fastify.db``}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `

  return rows
}

export async function deletePost(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<void> {
  const result =
    await fastify.db`DELETE FROM feed_posts WHERE id = ${postId} AND user_id = ${userId}`
  if (result.count === 0) throw new AppError(404, 'POST_NOT_FOUND', 'Post não encontrado')
}

// ─── Curtidas ─────────────────────────────────────────────────────────────────

export async function toggleLike(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<{ liked: boolean }> {
  const post = await assertPostVisible(fastify, userId, postId)

  const [existing] = await fastify.db<{ id: string }[]>`
    SELECT id FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}
  `

  if (existing) {
    await fastify.db`DELETE FROM post_likes WHERE id = ${existing.id}`
    return { liked: false }
  }

  await fastify.db`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${userId})`

  // Notifica o dono do post (best-effort — não derruba a curtida).
  try {
    await createNotification(fastify, {
      userId: post.user_id,
      actorId: userId,
      type: 'like',
      message: 'curtiu sua publicação',
      targetId: postId,
    })
  } catch (err) {
    fastify.log.warn(err, 'Falha ao criar notificação de like')
  }

  return { liked: true }
}

// ─── Comentários ──────────────────────────────────────────────────────────────

export async function addComment(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
  content: string,
): Promise<{ id: string }> {
  const post = await assertPostVisible(fastify, userId, postId)

  const [created] = await fastify.db<{ id: string }[]>`
    INSERT INTO post_comments (post_id, user_id, content)
    VALUES (${postId}, ${userId}, ${content})
    RETURNING id
  `

  // Notifica o dono do post (best-effort — não derruba o comentário).
  try {
    await createNotification(fastify, {
      userId: post.user_id,
      actorId: userId,
      type: 'comment',
      message: 'comentou na sua publicação',
      targetId: postId,
    })
  } catch (err) {
    fastify.log.warn(err, 'Falha ao criar notificação de comentário')
  }

  return created
}

export async function getComments(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<Comment[]> {
  await assertPostVisible(fastify, userId, postId)

  return fastify.db<Comment[]>`
    SELECT
      c.id, c.content, c.created_at::TEXT AS created_at,
      json_build_object('id', a.id, 'username', a.username, 'full_name', a.full_name, 'avatar_url', a.avatar_url) AS author
    FROM post_comments c
    JOIN profiles a ON a.id = c.user_id
    WHERE c.post_id = ${postId}
    ORDER BY c.created_at ASC
  `
}
