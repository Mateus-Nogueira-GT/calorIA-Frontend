import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { utcTodayString } from '../../shared/local-date.js'
import {
  createSocialUser,
  resetSocialSchema,
  socialTestDb,
  socialTestUrl,
} from '../../shared/testing/social-schema.js'
import { fetchUserContext } from '../chat/chat-context.js'
import { listFriends } from '../friends/friends.service.js'
import { getUserProfile } from '../users/users.service.js'
import { checkIn, getLeaderboard } from './challenges.service.js'

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}
;(socialTestUrl ? describe : describe.skip)('desafios / PostgreSQL real', () => {
  const db = socialTestDb()
  const fastify = { db, log: { warn: () => {} } } as unknown as FastifyInstance
  const userA = randomUUID()
  const userB = randomUUID()
  let challengeId: string

  beforeAll(async () => {
    await resetSocialSchema(db)
    await createSocialUser(db, userA, 'Ana')
    await createSocialUser(db, userB, 'Bruno')
  })
  beforeEach(async () => {
    await db`TRUNCATE challenges, feed_posts CASCADE`
    const today = utcTodayString()
    const [c] = await db<{ id: string }[]>`
      INSERT INTO challenges (creator_id, title, duration_days, starts_at, ends_at)
      VALUES (${userA}, 'Sete dias', 7, ${shift(today, -3)}, ${shift(today, 7)})
      RETURNING id`
    challengeId = c.id
    await db`INSERT INTO challenge_members (challenge_id, user_id) VALUES (${c.id}, ${userA}), (${c.id}, ${userB})`
  })
  afterAll(async () => {
    await db.end()
  })

  const member = async (userId: string) => {
    const [m] = await db<
      { current_streak: number; best_streak: number; total_days: number; last_check_in: string }[]
    >`SELECT current_streak, best_streak, total_days, last_check_in::TEXT AS last_check_in
      FROM challenge_members WHERE challenge_id = ${challengeId} AND user_id = ${userId}`
    return m
  }

  describe('check-in (R3)', () => {
    it('data anterior ao último check-in é recusada com 409 e não mexe no estado', async () => {
      const today = utcTodayString()
      await checkIn(fastify, userA, challengeId, today)
      const before = await member(userA)

      await expect(checkIn(fastify, userA, challengeId, shift(today, -1))).rejects.toMatchObject({
        statusCode: 409,
      })

      expect(await member(userA)).toEqual(before)
      const days = await db`SELECT check_date FROM challenge_days`
      expect(days).toHaveLength(1)
    })

    it('hoje, amanhã e de novo hoje no mesmo dia real não somam: hoje é recusado', async () => {
      const today = utcTodayString()
      await checkIn(fastify, userA, challengeId, today)
      await checkIn(fastify, userA, challengeId, shift(today, 1))

      await expect(checkIn(fastify, userA, challengeId, today)).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(await member(userA)).toMatchObject({
        current_streak: 2,
        total_days: 2,
        last_check_in: shift(today, 1),
      })
    })

    it('data anterior ao início do desafio é recusada', async () => {
      const today = utcTodayString()
      await db`UPDATE challenges SET starts_at = ${today} WHERE id = ${challengeId}`

      await expect(checkIn(fastify, userA, challengeId, shift(today, -1))).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(await member(userA)).toMatchObject({ total_days: 0, last_check_in: null })
    })

    it('total_days só sobe quando o dia de fato foi inserido', async () => {
      // Resto do bug antigo: o dia de amanhã já está em challenge_days, mas o
      // último check-in voltou para ontem.
      const today = utcTodayString()
      const [m] = await db<{ id: string }[]>`
        UPDATE challenge_members SET current_streak = 1, total_days = 2, last_check_in = ${shift(today, -1)}
        WHERE challenge_id = ${challengeId} AND user_id = ${userA} RETURNING id`
      await db`INSERT INTO challenge_days (member_id, check_date) VALUES (${m.id}, ${shift(today, -1)}), (${m.id}, ${shift(today, 1)})`

      await checkIn(fastify, userA, challengeId, shift(today, 1))

      expect(await member(userA)).toMatchObject({ total_days: 2, current_streak: 1 })
    })

    it('o caso normal continua: ontem e hoje dão sequência 2', async () => {
      const today = utcTodayString()
      await checkIn(fastify, userB, challengeId, shift(today, -1))
      const res = await checkIn(fastify, userB, challengeId, today)
      expect(res).toMatchObject({ current_streak: 2, total_days: 2 })
    })
  })

  describe('sequência efetiva na leitura (R1)', () => {
    // Datas relativas ao "hoje" de Brasília calculado pelo próprio banco.
    const spToday = db`(now() AT TIME ZONE 'America/Sao_Paulo')::date`

    it('ranking: quem parou aparece com 0 e vem depois de quem está em dia', async () => {
      await db`UPDATE challenge_members SET current_streak = 10, best_streak = 10, total_days = 10,
        last_check_in = ${spToday} - 5 WHERE challenge_id = ${challengeId} AND user_id = ${userA}`
      await db`UPDATE challenge_members SET current_streak = 3, best_streak = 3, total_days = 3,
        last_check_in = ${spToday} WHERE challenge_id = ${challengeId} AND user_id = ${userB}`

      const rows = await getLeaderboard(fastify, userA, challengeId)

      expect(rows.map((r) => [r.user.id, r.streak])).toEqual([
        [userB, 3],
        [userA, 0],
      ])
    })

    it('ranking: check-in de ontem ainda conta, e o empate cai em total_days e user_id', async () => {
      await db`UPDATE challenge_members SET current_streak = 2, total_days = 2,
        last_check_in = ${spToday} - 1 WHERE challenge_id = ${challengeId}`

      const rows = await getLeaderboard(fastify, userA, challengeId)

      expect(rows.map((r) => r.streak)).toEqual([2, 2])
      expect(rows.map((r) => r.user.id)).toEqual([userA, userB].sort())
    })

    it('amigos, perfil e coach: sequência pessoal parada vale 0', async () => {
      await db`TRUNCATE friendships`
      await db`INSERT INTO friendships (requester_id, addressee_id, status) VALUES (${userA}, ${userB}, 'accepted')`
      await db`UPDATE streaks SET current_streak = 10, best_streak = 10, last_active_date = ${spToday} - 5 WHERE user_id = ${userA}`
      await db`UPDATE streaks SET current_streak = 4, best_streak = 4, last_active_date = ${spToday} - 1 WHERE user_id = ${userB}`

      const [friendOfB] = await listFriends(fastify, userB)
      expect(friendOfB).toMatchObject({ id: userA, current_streak: 0 })
      const [friendOfA] = await listFriends(fastify, userA)
      expect(friendOfA).toMatchObject({ id: userB, current_streak: 4 })

      expect((await getUserProfile(fastify, userA)).current_streak).toBe(0)
      expect((await getUserProfile(fastify, userB)).current_streak).toBe(4)

      expect((await fetchUserContext(fastify, userA)).streak).toBe(0)
      expect((await fetchUserContext(fastify, userB)).streak).toBe(4)
    })
  })
})
