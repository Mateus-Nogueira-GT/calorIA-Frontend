import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import type postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createSocialUser,
  resetSocialSchema,
  socialTestDb,
  socialTestUrl,
} from '../../shared/testing/social-schema.js'
import { likePost } from './feed.service.js'
;(socialTestUrl ? describe : describe.skip)('feed / contadores em PostgreSQL real', () => {
  const db = socialTestDb()
  const fastify = { db, log: { warn: () => {} } } as unknown as FastifyInstance
  const author = randomUUID()
  const friend = randomUUID()
  const other = randomUUID()
  let postId: string

  beforeAll(async () => {
    await resetSocialSchema(db)
    for (const [id, name] of [
      [author, 'Ana'],
      [friend, 'Bruno'],
      [other, 'Caio'],
    ])
      await createSocialUser(db, id, name)
    await db`INSERT INTO friendships (requester_id, addressee_id, status) VALUES (${author}, ${friend}, 'accepted')`
  })
  beforeEach(async () => {
    await db`TRUNCATE feed_posts, notifications CASCADE`
    const [p] = await db<{ id: string }[]>`
      INSERT INTO feed_posts (user_id, content) VALUES (${author}, 'oi') RETURNING id`
    postId = p.id
  })
  afterAll(async () => {
    await db.end()
  })

  const counts = async () => {
    const [row] = await db<{ likes_count: number; comments_count: number }[]>`
      SELECT likes_count, comments_count FROM feed_posts WHERE id = ${postId}`
    return row
  }

  /** Espera até `n` conexões deste banco estarem bloqueadas esperando lock. */
  const waitForLockWaiters = async (n: number) => {
    for (let i = 0; i < 200; i++) {
      const [{ waiting }] = await db<{ waiting: number }[]>`
        SELECT COUNT(*)::INT AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`
      if (waiting >= n) return
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('a segunda transação nunca ficou esperando o lock')
  }

  /** Abre a transação 1 com `stmt` executado e a mantém aberta até `commit()`. */
  const holdOpen = async (stmt: (sql: postgres.TransactionSql) => Promise<unknown>) => {
    let commit!: () => void
    let ready!: () => void
    const held = new Promise<void>((r) => {
      commit = r
    })
    const started = new Promise<void>((r) => {
      ready = r
    })
    const tx = db.begin(async (sql) => {
      await stmt(sql)
      ready()
      await held
    })
    await started
    return { commit, done: tx }
  }

  it('duas curtidas concorrentes dão likes_count = 2', async () => {
    const tx1 = await holdOpen(
      (sql) => sql`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${friend})`,
    )
    // .execute(): o postgres.js só envia a query quando ela é consumida.
    const tx2 = db`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${other})`.execute()
    await waitForLockWaiters(1)
    tx1.commit()
    await tx1.done
    await tx2

    expect((await counts()).likes_count).toBe(2)
  })

  it('dois comentários concorrentes dão comments_count = 2, e apagar desconta', async () => {
    const tx1 = await holdOpen(
      (sql) =>
        sql`INSERT INTO post_comments (post_id, user_id, content) VALUES (${postId}, ${friend}, 'a')`,
    )
    const tx2 =
      db`INSERT INTO post_comments (post_id, user_id, content) VALUES (${postId}, ${other}, 'b')`.execute()
    await waitForLockWaiters(1)
    tx1.commit()
    await tx1.done
    await tx2
    expect((await counts()).comments_count).toBe(2)

    await db`DELETE FROM post_comments WHERE user_id = ${other}`
    expect((await counts()).comments_count).toBe(1)
  })

  it('a migration 029 recalcula os contadores que já estavam errados', async () => {
    await db`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${friend})`
    await db`UPDATE feed_posts SET likes_count = 5, comments_count = 3 WHERE id = ${postId}`

    await db.unsafe(
      await readFile(
        new URL('../../../supabase/migrations/029_feed_counters_atomic.sql', import.meta.url),
        'utf8',
      ),
    )

    expect(await counts()).toEqual({ likes_count: 1, comments_count: 0 })
  })

  it('duas curtidas seguidas do mesmo usuário não dão erro nem contam duas vezes', async () => {
    await expect(likePost(fastify, friend, postId)).resolves.toEqual({
      likeCount: 1,
      likedByMe: true,
    })
    await expect(likePost(fastify, friend, postId)).resolves.toEqual({
      likeCount: 1,
      likedByMe: true,
    })
    expect(await db`SELECT 1 FROM notifications`).toHaveLength(1)
  })

  it('curtida simultânea do mesmo usuário não dá 500 (corrida no UNIQUE)', async () => {
    // A 1ª requisição inseriu e ainda não fez commit: a 2ª não a enxerga no
    // SELECT prévio e batia no UNIQUE (23505 → 500).
    const tx1 = await holdOpen(
      (sql) => sql`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${friend})`,
    )
    const second = likePost(fastify, friend, postId)
    await waitForLockWaiters(1)
    tx1.commit()
    await tx1.done

    await expect(second).resolves.toEqual({ likeCount: 1, likedByMe: true })
    // Quem não inseriu não notifica.
    expect(await db`SELECT 1 FROM notifications`).toHaveLength(0)
  })
})
