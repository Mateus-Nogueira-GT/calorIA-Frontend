import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { createDietJob } from './jobs.service.js'

interface Call {
  sql: string
  params: unknown[]
}

/** Mock do template tagueado do postgres.js, com suporte a `begin`. */
function fakeFastify(queue: unknown[][]): { fastify: FastifyInstance; calls: Call[] } {
  const calls: Call[] = []
  const db = (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ sql: strings.join(' ? '), params })
    return Promise.resolve(queue.shift() ?? [])
  }
  // biome-ignore lint/suspicious/noExplicitAny: mock mínimo do driver
  ;(db as any).begin = (fn: (sql: unknown) => Promise<unknown>) => fn(db)
  return {
    fastify: {
      db,
      log: { info: () => {}, error: () => {}, warn: () => {} },
    } as unknown as FastifyInstance,
    calls,
  }
}

const USER = '11111111-1111-1111-1111-111111111111'
const CONVERSA = '22222222-2222-2222-2222-222222222222'

const DADOS = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'lose_weight',
  activity_level: 'moderate',
  meals_per_day: 4,
  message_to_user: 'ok',
} as unknown as Parameters<typeof createDietJob>[3]

describe('createDietJob — não abre duas gerações para o mesmo usuário', () => {
  /**
   * O chat chama createDietJob toda vez que a IA usa collect_diet_data. Depois
   * que a dieta existe, qualquer "ok" era lido como confirmação e a tool era
   * chamada de novo: o usuário via a dieta ser gerada repetidamente, e cada
   * plano novo zerava as refeições marcadas como concluídas.
   */
  it('reaproveita o job pendente/rodando em vez de criar outra dieta', async () => {
    const { fastify, calls } = fakeFastify([[{ id: 'job-existente', diet_id: 'dieta-existente' }]])

    const result = await createDietJob(fastify, USER, CONVERSA, DADOS)

    expect(result).toEqual({ jobId: 'job-existente', dietId: 'dieta-existente' })
    // Uma única consulta: a de checagem. Nada foi inserido.
    expect(calls).toHaveLength(1)
    expect(calls.every((c) => !c.sql.includes('INSERT INTO diets'))).toBe(true)
    expect(calls.every((c) => !c.sql.includes('INSERT INTO diet_jobs'))).toBe(true)
  })

  it('a checagem considera só pending/running do próprio usuário', async () => {
    const { fastify, calls } = fakeFastify([[{ id: 'j', diet_id: 'd' }]])

    await createDietJob(fastify, USER, CONVERSA, DADOS)

    expect(calls[0].sql).toContain('FROM diet_jobs')
    expect(calls[0].sql).toContain("status IN ('pending', 'running')")
    expect(calls[0].params).toContain(USER)
  })

  it('sem job em andamento, cria a dieta e o job normalmente', async () => {
    const { fastify, calls } = fakeFastify([[]])

    const result = await createDietJob(fastify, USER, CONVERSA, DADOS)

    expect(result.jobId).toBeTruthy()
    expect(result.dietId).toBeTruthy()
    expect(calls.some((c) => c.sql.includes('INSERT INTO diets'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(true)
  })
})
