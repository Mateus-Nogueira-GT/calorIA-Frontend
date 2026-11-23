import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { challengeSchema } from './challenges.schemas.js'
import { listMyChallenges } from './challenges.service.js'

/** Mock do postgres.js: cada template tagueado consome a próxima resposta da fila. */
function fakeFastify(queue: unknown[][]): FastifyInstance {
  const db = () => Promise.resolve(queue.shift() ?? [])
  return { db } as unknown as FastifyInstance
}

const row = {
  id: '22222222-2222-2222-2222-222222222222',
  title: 'Perder 3kg em 7 dias',
  description: null,
  invite_code: 'ABC123',
  start_date: '2026-11-23',
  end_date: '2026-11-30',
  participant_count: 1,
  joined_by_me: true,
  is_finished: false,
}

describe('listMyChallenges — último check-in do usuário', () => {
  it('devolve myLastCheckIn para o app saber se o check-in de hoje já foi feito', async () => {
    // 1ª resposta: o fragmento de colunas (selectChallenge); 2ª: as linhas.
    const fastify = fakeFastify([[], [{ ...row, my_last_check_in: '2026-11-23' }]])

    const [challenge] = await listMyChallenges(fastify, 'user')

    expect(challenge.myLastCheckIn).toBe('2026-11-23')
    expect(challengeSchema.parse(challenge).myLastCheckIn).toBe('2026-11-23')
  })

  it('sem check-in, myLastCheckIn é null', async () => {
    const fastify = fakeFastify([[], [{ ...row, my_last_check_in: null }]])

    const [challenge] = await listMyChallenges(fastify, 'user')

    expect(challenge.myLastCheckIn).toBeNull()
  })
})
