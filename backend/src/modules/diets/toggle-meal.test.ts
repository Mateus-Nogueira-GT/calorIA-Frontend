import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  // Relógio congelado no dia usado nos casos: o serviço recusa datas fora da
  // janela de 30 dias (isWithinDateWindow), e com o relógio real os testes
  // começaram a falhar sozinhos um mês depois de escritos.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-28T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('não escreve updated_at em diet_meals (a coluna não existe — 006_diets.sql)', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: true }], [], []])

    await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)

    const updateCall = calls.find((c) => c.sql.includes('UPDATE diet_meals'))
    expect(updateCall).toBeDefined()
    expect(updateCall?.sql).not.toMatch(/updated_at/)
  })

  it('cliente SEM fuso mantém o comportamento antigo (NOT is_completed)', async () => {
    // O app publicado envia só `date`. Comparar completed_at em UTC com a data
    // local dele quebra entre 21h e 24h BRT: a refeição marcada às 21h30 grava
    // completed_at no dia seguinte em UTC, a comparação dá falso e o toque
    // seguinte MARCARIA de novo em vez de desmarcar.
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28')

    expect(calls[0].params).toContain(false) // hasClientTz
    expect(calls[0].sql).toContain('dm.is_completed')
  })

  it('cliente COM fuso usa a data local', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', -180)

    expect(calls[0].params).toContain(true) // hasClientTz
    expect(calls[0].params).toContain(-180)
  })

  it('fuso 0 explícito conta como fuso informado (UTC de verdade)', async () => {
    // Cliente novo em UTC manda 0: não pode ser confundido com "não informou".
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])

    await toggleMealCompleted(fastify, USER, MEAL, '2026-08-28', 0)

    expect(calls[0].params).toContain(true)
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

describe('toggle com estado pedido (05/11, cartão "Marcar como feita")', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('completed: true com a refeição já marcada não desmarca nem credita streak de novo', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: true, was_completed: true }]])
    const r = await toggleMealCompleted(fastify, USER, MEAL, '2026-11-05', -180, true)
    expect(r).toEqual({ is_completed: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('COALESCE(')
    expect(calls[0].params).toContain(true)
  })

  it('completed: true numa refeição pendente marca e credita o streak', async () => {
    const { fastify, calls } = fakeFastify([
      [{ is_completed: true, was_completed: false }],
      [],
      [{ current_streak: 2 }],
    ])
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-05', -180, true)
    expect(calls.some((c) => c.sql.includes('update_user_streak'))).toBe(true)
  })

  it('sem completed, o parâmetro vai nulo (inverte como antes)', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: false }]])
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-05', -180)
    expect(calls[0].params).toContain(null)
  })
})

describe('dia da conclusão e limites de data (R4, lote 8)', () => {
  // 22h BRT de 25/11: em UTC já é 26/11.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T01:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const updateParams = (calls: Call[]) =>
    calls.find((c) => c.sql.includes('UPDATE diet_meals'))?.params ?? []

  it('hoje no fuso do cliente (22h BRT) grava o instante do toque', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: true, was_completed: true }]])
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-25', -180, true)
    // Sem instante do dia passado: o SQL cai no NOW().
    expect(updateParams(calls).some((p) => typeof p === 'string' && p.includes('T'))).toBe(false)
  })

  it('ontem no fuso do cliente grava 12:00 local daquele dia', async () => {
    const { fastify, calls } = fakeFastify([[{ is_completed: true, was_completed: true }]])
    await toggleMealCompleted(fastify, USER, MEAL, '2026-11-24', -180, true)
    expect(updateParams(calls)).toContain('2026-11-24T15:00:00.000Z')
  })

  it.each(['2026-11-26', '2026-11-23'])(
    'data futura ou anterior a ontem no fuso do cliente é recusada (%s)',
    async (date) => {
      const { fastify, calls } = fakeFastify([[{ is_completed: true }]])
      await expect(
        toggleMealCompleted(fastify, USER, MEAL, date, -180, true),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DATE' })
      expect(calls).toHaveLength(0)
    },
  )

  it('sem fuso (app publicado): São Paulo para o passado, UTC + 1 dia de folga para o futuro', async () => {
    const ok = fakeFastify([[{ is_completed: true, was_completed: true }]])
    await toggleMealCompleted(ok.fastify, USER, MEAL, '2026-11-24', undefined, true)
    expect(updateParams(ok.calls)).toContain('2026-11-24T15:00:00.000Z')
    const ahead = fakeFastify([[{ is_completed: true, was_completed: true }]])
    await expect(
      toggleMealCompleted(ahead.fastify, USER, MEAL, '2026-11-26'),
    ).resolves.toBeDefined()
    for (const date of ['2026-11-23', '2026-11-28'])
      await expect(
        toggleMealCompleted(fakeFastify([]).fastify, USER, MEAL, date),
      ).rejects.toMatchObject({ code: 'INVALID_DATE' })
  })
})
