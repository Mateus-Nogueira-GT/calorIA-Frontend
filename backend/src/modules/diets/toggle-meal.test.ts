import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { toggleMealCompleted } from './diets.service.js'

interface Call {
  sql: string
  params: unknown[]
}

/**
 * Mock do template tagueado do postgres.js: captura SQL e parâmetros e devolve
 * as linhas enfileiradas, na ordem em que o serviço consulta.
 */
function fakeFastify(queue: unknown[][]): { fastify: FastifyInstance; calls: Call[] } {
  const calls: Call[] = []
  const db = (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ sql: strings.join(' ? '), params })
    return Promise.resolve(queue.shift() ?? [])
  }
  return { fastify: { db } as unknown as FastifyInstance, calls }
}

const USER = '11111111-1111-1111-1111-111111111111'
const MEAL = '22222222-2222-2222-2222-222222222222'

describe('toggleMealCompleted — estado derivado da data (B1)', () => {
  it('decide pelo dia local do cliente, não por NOT is_completed', async () => {
    // Refeição já concluída HOJE → o toggle desmarca (1 única query, sem streak).
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    const result = await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)

    expect(result).toEqual({ is_completed: false })
    expect(calls).toHaveLength(1)

    const { sql, params } = calls[0]
    // O novo estado vem de completed_at convertido para a hora local do cliente.
    expect(sql).toContain('completed_on_date')
    expect(sql).toContain('make_interval')
    expect(sql).not.toContain('NOT dm.is_completed')
    // Data e fuso do cliente chegam como parâmetros da comparação.
    expect(params).toContain('2026-08-28')
    expect(params).toContain(-180)
  })

  it('mantém o ownership do usuário na mesma instrução', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)

    expect(calls[0].sql).toContain('d.user_id')
    expect(calls[0].params).toContain(USER)
    expect(calls[0].params).toContain(MEAL)
  })

  it('ao MARCAR, credita o streak na data local do cliente', async () => {
    const { fastify, calls } = fakeFastify([
      [{ is_completed: true }], // UPDATE
      [], // SELECT update_user_streak(...)
      [], // SELECT current_streak
    ])

    const result = await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)

    expect(result).toEqual({ is_completed: true })
    const streakCall = calls.find((c) => c.sql.includes('update_user_streak'))
    expect(streakCall).toBeDefined()
    // Antes o fallback era CURRENT_DATE (UTC), que vira o dia às 21h BRT.
    expect(streakCall?.params).toContain('2026-08-28')
    expect(streakCall?.sql).not.toContain('CURRENT_DATE')
  })

  it('sem data/fuso do cliente, cai em UTC (compatível com cliente antigo)', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    await toggleMealCompleted(fastify, USER, MEAL)

    expect(calls[0].params).toContain(0)
  })

  it('recusa data fora da janela permitida', async () => {
    const { fastify } = fakeFastify([[{ is_completed: false }]])

    await expect(toggleMealCompleted(fastify, USER, MEAL, '1999-01-01', 0)).rejects.toThrow()
  })

  it('404 quando a refeição não é do usuário', async () => {
    const { fastify } = fakeFastify([[]])

    await expect(toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)).rejects.toThrow(
      /não encontrada/i,
    )
  })
})
