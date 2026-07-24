import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { createNotification } from '../notifications/notifications.service.js'
import type { Comment, LikeResult, Post, PostAchievement, PostType } from './feed.schemas.js'

interface DbPostRow {
  id: string
  type: PostType
  content: string | null
  metadata: Record<string, unknown>
  created_at: string
  liked_by_me: boolean
  like_count: number
  comment_count: number
  author_id: string
  author_full_name: string | null
  author_username: string | null
  author_avatar_url: string | null
  author_avatar_emoji: string | null
}

interface DbAuthorRow {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  avatar_emoji: string | null
}

const ACHIEVEMENT_TO_TYPE: Record<PostAchievement['type'], PostType> = {
  meal_logged: 'meal_completed',
  diet_completed: 'diet_generated',
  streak: 'streak_milestone',
}

function authorName(fullName: string | null, username: string | null): string {
  return fullName ?? username ?? 'Usuário'
}

function postRowToAuthor(row: DbPostRow): Post['author'] {
  return {
    id: row.author_id,
    name: authorName(row.author_full_name, row.author_username),
    avatarEmoji: row.author_avatar_emoji,
    avatarUrl: row.author_avatar_url,
  }
}

function authorRowToAuthor(row: DbAuthorRow): Post['author'] {
  return {
    id: row.id,
    name: authorName(row.full_name, row.username),
    avatarEmoji: row.avatar_emoji,
    avatarUrl: row.avatar_url,
  }
}

/** Deriva o badge de conquista do post (metadata.achievement tem prioridade). */
export function toAchievement(type: PostType, metadata: Record<string, unknown>): PostAchievement | null {
  const fromMeta = metadata?.achievement
  if (fromMeta && typeof fromMeta === 'object') return fromMeta as PostAchievement

  switch (type) {
    case 'meal_completed':
      return { type: 'meal_logged', emoji: '🍽️', title: 'Refeição concluída', subtitle: 'Mais um passo no plano' }
    case 'diet_generated':
      return { type: 'diet_completed', emoji: '📋', title: 'Plano atualizado', subtitle: 'Nova dieta gerada' }
    case 'streak_milestone': {
      const days = typeof metadata?.streak === 'number' ? metadata.streak : null
      return {
        type: 'streak',
        emoji: '🔥',
        title: days ? `${days} dias seguidos` : 'Sequência mantida',
        subtitle: 'Continue assim',
      }
    }
    default:
      return null
  }
}

// Os contadores vêm agregados na própria query (evita N+1 por post).
function rowToPost(row: DbPostRow): Post {
  return {
    id: row.id,
    author: postRowToAuthor(row),
    content: row.content ?? '',
    achievement: toAchievement(row.type, row.metadata ?? {}),
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: row.liked_by_me,
    createdAt: row.created_at,
  }
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

async function insertPost(
  fastify: FastifyInstance,
  userId: string,
  content: string,
  type: PostType,
  metadata: Record<string, unknown>,
): Promise<{ id: string }> {
  const metadataJson = JSON.stringify(metadata)
  const [created] = await fastify.db<{ id: string }[]>`
    INSERT INTO feed_posts (user_id, type, content, metadata)
    VALUES (${userId}, ${type}, ${content}, ${metadataJson}::jsonb)
    RETURNING id
  `
  return created
}

/** Helper para outros módulos publicarem posts automáticos (streak, desafio, dieta). */
export async function createSystemPost(
  fastify: FastifyInstance,
  userId: string,
  type: PostType,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await insertPost(fastify, userId, content, type, metadata)
}

export async function getPostById(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<Post> {
  const [row] = await fastify.db<DbPostRow[]>`
    SELECT
      p.id, p.type, p.content, p.metadata,
      p.created_at::TEXT AS created_at,
      EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${userId}) AS liked_by_me,
      p.likes_count AS like_count,
      p.comments_count AS comment_count,
      a.id AS author_id, a.full_name AS author_full_name, a.username AS author_username,
      a.avatar_url AS author_avatar_url, a.avatar_emoji AS author_avatar_emoji
    FROM feed_posts p
    JOIN profiles a ON a.id = p.user_id
    WHERE p.id = ${postId}
  `
  if (!row) throw new AppError(404, 'POST_NOT_FOUND', 'Post não encontrado')
  return rowToPost(row)
}

/** Cria um post do próprio usuário (com conquista opcional) e retorna o post completo. */
export async function createUserPost(
  fastify: FastifyInstance,
  userId: string,
  content: string,
  achievement?: PostAchievement,
): Promise<Post> {
  const type = achievement ? ACHIEVEMENT_TO_TYPE[achievement.type] : 'custom'
  const metadata = achievement ? { achievement } : {}
  const { id } = await insertPost(fastify, userId, content, type, metadata)
  return getPostById(fastify, userId, id)
}

/**
 * Cursor keyset composto (G2): "created_at|id" — só created_at permitia pular
 * ou duplicar posts com timestamp idêntico entre páginas. Opaco para o cliente.
 * Retrocompatível: cursor antigo (sem "|") vira só created_at com id máximo.
 */
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export function encodeFeedCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`
}

export function decodeFeedCursor(cursor: string): { createdAt: string; id: string } {
  const sep = cursor.lastIndexOf('|')
  if (sep === -1) return { createdAt: cursor, id: MAX_UUID }
  return { createdAt: cursor.slice(0, sep), id: cursor.slice(sep + 1) }
}

export async function getFeed(
  fastify: FastifyInstance,
  userId: string,
  limit: number,
  cursor?: string,
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const decoded = cursor ? decodeFeedCursor(cursor) : null

  // G1: are_friends() por linha varria feed_posts GLOBAL até achar `limit`
  // posts de amigos (custo cresce com o app inteiro). A CTE materializa os ids
  // de amigos uma vez e o filtro usa índice em feed_posts(user_id, created_at).
  const rows = await fastify.db<DbPostRow[]>`
    WITH friend_ids AS (
      SELECT CASE WHEN f.requester_id = ${userId} THEN f.addressee_id ELSE f.requester_id END AS id
      FROM friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_id = ${userId} OR f.addressee_id = ${userId})
    )
    SELECT
      p.id, p.type, p.content, p.metadata,
      p.created_at::TEXT AS created_at,
      EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${userId}) AS liked_by_me,
      p.likes_count AS like_count,
      p.comments_count AS comment_count,
      a.id AS author_id, a.full_name AS author_full_name, a.username AS author_username,
      a.avatar_url AS author_avatar_url, a.avatar_emoji AS author_avatar_emoji
    FROM feed_posts p
    JOIN profiles a ON a.id = p.user_id
    WHERE (p.user_id = ${userId} OR p.user_id IN (SELECT id FROM friend_ids))
      ${decoded ? fastify.db`AND (p.created_at, p.id) < (${decoded.createdAt}, ${decoded.id})` : fastify.db``}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ${limit}
  `

  const posts = rows.map(rowToPost)
  const last = rows[rows.length - 1]
  const nextCursor = rows.length === limit ? encodeFeedCursor(last.created_at, last.id) : null
  return { posts, nextCursor }
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

// ─── Curtidas (like / unlike explícitos e idempotentes) ─────────────────────────

async function likeResult(
  fastify: FastifyInstance,
  postId: string,
  likedByMe: boolean,
): Promise<LikeResult> {
  // likes_count é mantido por trigger (migration 007) — leitura direta, sem COUNT.
  const [{ likes_count }] = await fastify.db<{ likes_count: number }[]>`
    SELECT likes_count FROM feed_posts WHERE id = ${postId}
  `
  return { likeCount: likes_count, likedByMe }
}

export async function likePost(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<LikeResult> {
  const post = await assertPostVisible(fastify, userId, postId)

  const [existing] = await fastify.db<{ id: string }[]>`
    SELECT id FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}
  `
  if (!existing) {
    await fastify.db`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${userId})`
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
  }

  return likeResult(fastify, postId, true)
}

export async function unlikePost(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<LikeResult> {
  await assertPostVisible(fastify, userId, postId)
  await fastify.db`DELETE FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}`
  return likeResult(fastify, postId, false)
}

// ─── Comentários ──────────────────────────────────────────────────────────────

export async function addComment(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
  content: string,
): Promise<Comment> {
  const post = await assertPostVisible(fastify, userId, postId)

  const [created] = await fastify.db<{ id: string; created_at: string }[]>`
    INSERT INTO post_comments (post_id, user_id, content)
    VALUES (${postId}, ${userId}, ${content})
    RETURNING id, created_at::TEXT AS created_at
  `

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

  const [author] = await fastify.db<DbAuthorRow[]>`
    SELECT id, full_name, username, avatar_url, avatar_emoji FROM profiles WHERE id = ${userId}
  `

  return {
    id: created.id,
    postId,
    author: authorRowToAuthor(author),
    content,
    createdAt: created.created_at,
  }
}

export async function getComments(
  fastify: FastifyInstance,
  userId: string,
  postId: string,
): Promise<Comment[]> {
  await assertPostVisible(fastify, userId, postId)

  const rows = await fastify.db<
    {
      id: string
      content: string
      created_at: string
      author_id: string
      author_full_name: string | null
      author_username: string | null
      author_avatar_url: string | null
      author_avatar_emoji: string | null
    }[]
  >`
    SELECT
      c.id, c.content, c.created_at::TEXT AS created_at,
      a.id AS author_id, a.full_name AS author_full_name, a.username AS author_username,
      a.avatar_url AS author_avatar_url, a.avatar_emoji AS author_avatar_emoji
    FROM post_comments c
    JOIN profiles a ON a.id = c.user_id
    WHERE c.post_id = ${postId}
    ORDER BY c.created_at ASC
  `

  return rows.map((r) => ({
    id: r.id,
    postId,
    author: {
      id: r.author_id,
      name: authorName(r.author_full_name, r.author_username),
      avatarEmoji: r.author_avatar_emoji,
      avatarUrl: r.author_avatar_url,
    },
    content: r.content,
    createdAt: r.created_at,
  }))
}
