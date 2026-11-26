import { describe, expect, it } from 'vitest'
import type { CollectedUserData } from '../../shared/diet-ai-schema.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { createDietJob, retryJob } from './jobs.service.js'

/**
 * R7 (26/11): a migration 031 cria o índice único parcial "um job ativo por
 * usuário". Quem perde a corrida recebe 23505 e não pode virar erro 500.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const JOB = '33333333-3333-3333-3333-333333333333'
const DIET = '44444444-4444-4444-4444-444444444444'

const dados = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'maintain',
  activity_level: 'moderate',
  meals_per_day: 3,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'ok',
  health_conditions: [],
} as CollectedUserData

/** Erro do postgres.js para o índice da 031. */
function uniqueViolation(constraint = 'diet_jobs_one_active_per_user') {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: constraint,
  })
}

/** A busca do job ativo em getPendingJob (a expiração STALE não tem ORDER BY). */
const ACTIVE = "('pending', 'running')\n    ORDER BY"

describe('createDietJob — corrida com o índice da 031', () => {
  it('23505 no insert devolve o job ativo que ganhou a corrida', async () => {
    let checks = 0
    const { fastify, calls } = fakeFastify([
      // 1ª checagem: nada em andamento; depois do conflito, o job do vencedor.
      [ACTIVE, () => (checks++ === 0 ? [] : [{ id: JOB, diet_id: DIET }])],
      ['INSERT INTO diet_jobs', uniqueViolation()],
    ])

    const result = await createDietJob(fastify, USER, CONV, dados)

    expect(result).toEqual({ jobId: JOB, dietId: DIET })
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(true)
  })

  it('23505 de outra constraint continua sendo erro', async () => {
    const { fastify } = fakeFastify([
      [ACTIVE, []],
      ['INSERT INTO diet_jobs', uniqueViolation('diet_jobs_pkey')],
    ])
    await expect(createDietJob(fastify, USER, CONV, dados)).rejects.toMatchObject({
      code: '23505',
    })
  })
})

describe('retryJob — outro job já ativo', () => {
  const failedRow = {
    id: JOB,
    conversation_id: CONV,
    diet_id: DIET,
    status: 'failed',
    input: dados,
    total_days: 7,
    days_completed: 2,
    error: 'STALE',
  }

  it('reabrir bateria no índice: devolve o estado real (failed), sem 500', async () => {
    const { fastify } = fakeFastify([
      ['FROM diet_jobs WHERE id', [failedRow]],
      ["SET status = 'running', error = NULL", uniqueViolation()],
    ])

    const r = await retryJob(fastify, USER, JOB)

    expect(r.status).toBe('failed')
    expect(r.jobId).toBe(JOB)
  })
})
