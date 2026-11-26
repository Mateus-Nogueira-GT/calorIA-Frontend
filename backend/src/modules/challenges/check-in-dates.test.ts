import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { checkIn } from './challenges.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CHALLENGE = '22222222-2222-2222-2222-222222222222'

describe('checkIn — datas só andam para frente (S3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const routes = (lastCheckIn: string | null, start = '2026-11-20') =>
    fakeFastify([
      ['FROM challenge_members', [{ id: 'm1', status: 'active', last_check_in: lastCheckIn }]],
      ['AS start_date', [{ start_date: start, end_date: '2026-12-02' }]],
    ])

  it('data anterior ao último check-in: 409 sem gravar nada', async () => {
    const { fastify, calls } = routes('2026-11-25')

    await expect(checkIn(fastify, USER, CHALLENGE, '2026-11-24')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHECK_IN_OUT_OF_ORDER',
    })
    expect(calls.some((c) => c.sql.includes('challenge_days'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('UPDATE challenge_members'))).toBe(false)
  })

  it('data anterior ao início do desafio: 409', async () => {
    const { fastify, calls } = routes(null, '2026-11-25')

    await expect(checkIn(fastify, USER, CHALLENGE, '2026-11-24')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHALLENGE_NOT_STARTED',
    })
    expect(calls.some((c) => c.sql.includes('challenge_days'))).toBe(false)
  })

  it('a guarda de ordem também vale dentro do UPDATE (corrida entre toques)', async () => {
    const { fastify, calls } = routes('2026-11-24')

    // UPDATE sem linhas: outra requisição já avançou o check-in.
    await expect(checkIn(fastify, USER, CHALLENGE, '2026-11-25')).rejects.toMatchObject({
      code: 'ALREADY_CHECKED_IN',
    })
    const update = calls.find((c) => c.sql.includes('UPDATE challenge_members'))
    expect(update?.sql).toContain('last_check_in <')
  })
})
