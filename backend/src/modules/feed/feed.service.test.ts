import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { decodeFeedCursor, encodeFeedCursor, likePost, toAchievement } from './feed.service.js'

describe('toAchievement', () => {
  it('metadata.achievement tem prioridade sobre o tipo', () => {
    const custom = { type: 'streak', emoji: '🏆', title: 'X', subtitle: 'Y' }
    expect(toAchievement('custom', { achievement: custom })).toEqual(custom)
  })

  it('deriva badge por tipo de post', () => {
    expect(toAchievement('meal_completed', {})?.type).toBe('meal_logged')
    expect(toAchievement('diet_generated', {})?.type).toBe('diet_completed')
    expect(toAchievement('streak_milestone', {})?.type).toBe('streak')
  })

  it('streak_milestone usa metadata.streak no título', () => {
    expect(toAchievement('streak_milestone', { streak: 14 })?.title).toBe('14 dias seguidos')
    expect(toAchievement('streak_milestone', {})?.title).toBe('Sequência mantida')
  })

  it('post custom sem metadata não tem badge', () => {
    expect(toAchievement('custom', {})).toBeNull()
  })
})

describe('cursor keyset do feed (G2)', () => {
  it('encode/decode ida-e-volta', () => {
    const c = encodeFeedCursor('2026-07-24 12:00:00+00', 'abc-123')
    expect(decodeFeedCursor(c)).toEqual({ createdAt: '2026-07-24 12:00:00+00', id: 'abc-123' })
  })

  it('cursor legado (só created_at) vira id máximo — não pula posts', () => {
    const d = decodeFeedCursor('2026-07-24 12:00:00+00')
    expect(d.createdAt).toBe('2026-07-24 12:00:00+00')
    expect(d.id).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff')
  })
})

describe('likePost — curtida idempotente (S8)', () => {
  const post = [{ id: 'p1', user_id: 'autor' }]

  it('INSERT com ON CONFLICT; sem linha inserida, não notifica de novo', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM feed_posts p', post],
      ['INSERT INTO post_likes', []],
      ['SELECT likes_count', [{ likes_count: 1 }]],
    ])

    await expect(likePost(fastify, 'eu', 'p1')).resolves.toEqual({ likeCount: 1, likedByMe: true })

    const insert = calls.find((c) => c.sql.includes('INSERT INTO post_likes'))
    expect(insert?.sql).toContain('ON CONFLICT')
    expect(calls.some((c) => c.sql.includes('INSERT INTO notifications'))).toBe(false)
  })

  it('primeira curtida notifica o autor', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM feed_posts p', post],
      ['INSERT INTO post_likes', [{}]],
      ['SELECT likes_count', [{ likes_count: 1 }]],
    ])

    await likePost(fastify, 'eu', 'p1')

    expect(calls.some((c) => c.sql.includes('INSERT INTO notifications'))).toBe(true)
  })
})
