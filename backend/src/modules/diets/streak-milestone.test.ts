import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DbRoute, fakeFastify } from '../../shared/testing/fake-fastify.js'
import { toggleMealCompleted } from './diets.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const MEAL = '22222222-2222-2222-2222-222222222222'

/** Marca uma refeição pendente; a sequência vai de `before` para `after`. */
function marking(before: number, after: number, postInsert: unknown[] | Error = []) {
  const routes: DbRoute[] = [
    ['UPDATE diet_meals', [{ is_completed: true, was_completed: false }]],
    ['update_user_streak', [{ previous_streak: before }]],
    ['SELECT current_streak FROM streaks', [{ current_streak: after }]],
    ['INSERT INTO feed_posts', postInsert],
  ]
  return fakeFastify(routes)
}

const posts = (calls: { sql: string }[]) =>
  calls.filter((c) => c.sql.includes('INSERT INTO feed_posts')).length

describe('toggleMealCompleted — post de marco da sequência (S2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('primeira refeição do 7º dia (6 → 7) publica o marco', async () => {
    const { fastify, calls } = marking(6, 7)
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-25', -180)
    expect(posts(calls)).toBe(1)
  })

  it('segunda refeição do mesmo dia (7 → 7) não publica de novo', async () => {
    const { fastify, calls } = marking(7, 7)
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-25', -180)
    expect(posts(calls)).toBe(0)
  })

  it('falha ao publicar o marco não derruba o toggle', async () => {
    const { fastify, logs } = marking(6, 7, new Error('feed fora do ar'))
    await expect(toggleMealCompleted(fastify, USER, MEAL, '2026-11-25', -180)).resolves.toEqual({
      is_completed: true,
    })
    expect(logs.some((l) => l.level === 'warn')).toBe(true)
  })
})
