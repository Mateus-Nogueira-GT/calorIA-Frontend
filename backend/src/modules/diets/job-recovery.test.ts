import { APIConnectionTimeoutError } from 'openai'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AiSingleDay, CollectedUserData } from '../../shared/diet-ai-schema.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { __resetFiberColumnsCache } from './fiber-columns.js'
import {
  DAY_GENERATION_TIMEOUT_MS,
  MAX_DAY_ATTEMPTS,
  STALE_JOB_MS,
  computeTargets,
  getActiveJob,
  getJob,
  getPendingJob,
  processJobStep,
  retryJob,
} from './jobs.service.js'

/**
 * Spec B (2026-10-05): "Gerando sua dieta — dia N de 7" congelava. Toda falha
 * do /step precisa deixar o job `failed` com um código legível pelo app, e um
 * job que parou de progredir (função morta pela Vercel, 500 antes do lock)
 * expira sozinho ao ser lido.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const DIET = '44444444-4444-4444-4444-444444444444'
const LOCK_TOKEN = '00000000-0000-0000-0000-000000000001'

const input: CollectedUserData = {
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
}
const targets = computeTargets(input)

function cleanDay(): AiSingleDay {
  const types = ['breakfast', 'lunch', 'dinner'] as const
  const p = targets.protein / 3
  const f = (targets.targetCalories * 0.25) / 9 / 3
  const kcal = targets.targetCalories / 3
  const c = (kcal - 4 * p - 9 * f) / 4
  return {
    day_name: 'Segunda',
    meals: types.map((t) => ({
      meal_type: t,
      name: t,
      time_suggestion: '12:00',
      total_calories: kcal,
      items: [
        {
          food_name: 'Frango grelhado',
          quantity_g: 150,
          unit: 'g',
          calories: kcal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
          fiber_g: 4,
          preparation_tip: null,
        },
      ],
    })),
  }
}

const jobRow = {
  id: JOB,
  conversation_id: null,
  diet_id: DIET,
  status: 'running',
  input,
  total_days: 7,
  days_completed: 3,
  error: null,
}
const staleRow = { ...jobRow, status: 'failed', error: 'STALE' }

type Call = { sql: string; params: unknown[] }
const isExpire = (c: Call) => c.sql.includes('WITH expired')
/** O UPDATE do failJob: o único que marca failed fenceado pelo token do lock. */
const failJobCall = (calls: Call[]) =>
  calls.find((c) => c.sql.includes("status = 'failed'") && c.sql.includes('AND step_token ='))

beforeEach(() => __resetFiberColumnsCache())

describe('(a) cota diária estourada no /step', () => {
  it('marca o job failed AI_QUOTA_EXCEEDED, libera o lock e responde 200 com status failed', async () => {
    const { fastify, calls, openaiCalls } = fakeFastify([
      ['FROM ai_usage', [{ used: Number.MAX_SAFE_INTEGER }]],
      ['FROM diet_jobs WHERE id', [jobRow]],
      ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
    ])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(0)
    expect(r.status).toBe('failed')
    expect(r.errorCode).toBe('AI_QUOTA_EXCEEDED')
    expect(r.errorMessage).toBe('Limite diário de IA atingido. Tente amanhã.')
    expect(r.daysCompleted).toBe(3)
    const fail = failJobCall(calls)
    expect(fail?.params).toContain('AI_QUOTA_EXCEEDED')
    expect(fail?.params).toContain(LOCK_TOKEN)
    expect(fail?.sql).toContain('step_token = NULL')
    // A draft também vira failed — o /retry a devolve para draft.
    expect(
      calls.some(
        (c) => c.sql.includes("UPDATE diets SET status = 'failed'") && c.params.includes(DIET),
      ),
    ).toBe(true)
  })
})

describe('(b) job sem progresso há mais de 10 min expira como STALE ao ser lido', () => {
  it('STALE_JOB_MS = 10 min', () => {
    expect(STALE_JOB_MS).toBe(10 * 60 * 1000)
  })

  it('o UPDATE de expiração é condicional, escopado ao usuário e limpa o lock', async () => {
    const { fastify, calls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET }]],
      ['FROM diet_jobs WHERE id', [staleRow]],
    ])

    await getJob(fastify, USER, JOB)

    const exp = calls.find(isExpire)
    expect(exp).toBeDefined()
    const sql = exp?.sql ?? ''
    expect(sql).toContain('UPDATE diet_jobs')
    expect(sql).toContain("status = 'failed'")
    expect(sql).toContain("error = 'STALE'")
    expect(sql).toContain('step_started_at = NULL')
    expect(sql).toContain('step_token = NULL')
    expect(sql).toContain('updated_at = NOW()')
    // Concorrência: só pega quem ainda está em voo e parado — dois leitores
    // simultâneos não brigam, e um step que acabou de persistir não é pego.
    expect(sql).toContain("status IN ('pending', 'running')")
    expect(sql).toContain('updated_at < NOW() - make_interval')
    expect(exp?.params).toContain(STALE_JOB_MS / 1000)
    // Lock vivo (step em andamento, ≤300 s) protege um step lento mas saudável.
    expect(sql).toMatch(/step_started_at IS NULL\s+OR step_started_at < NOW\(\) - make_interval/)
    expect(exp?.params).toContain(300)
    expect(exp?.params).toContain(USER)
    // A draft vira failed junto (o /retry a devolve para draft).
    expect(sql).toContain('UPDATE diets')
    expect(sql).toContain("status = 'draft'")
  })

  it('getJob: expira ANTES de ler e devolve failed STALE com mensagem amigável', async () => {
    const { fastify, calls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET }]],
      ['FROM diet_jobs WHERE id', [staleRow]],
    ])

    const r = await getJob(fastify, USER, JOB)

    const expIdx = calls.findIndex(isExpire)
    const readIdx = calls.findIndex((c) => c.sql.includes('FROM diet_jobs WHERE id'))
    expect(expIdx).toBeGreaterThanOrEqual(0)
    expect(expIdx).toBeLessThan(readIdx)
    expect(r.status).toBe('failed')
    expect(r.errorCode).toBe('STALE')
    expect(r.errorMessage).toMatch(/parou de responder/i)
    expect(r.daysCompleted).toBe(3)
  })

  it('getActiveJob: sem job em voo mas um acabou de expirar → devolve esse failed STALE', async () => {
    const { fastify, calls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET, created_at: new Date() }]],
      ['ORDER BY created_at DESC', []],
      ['FROM diet_jobs WHERE id', [staleRow]],
    ])

    const r = await getActiveJob(fastify, USER)

    expect(calls.findIndex(isExpire)).toBe(0)
    expect(r.jobId).toBe(JOB)
    expect(r.status).toBe('failed')
    expect(r.errorCode).toBe('STALE')
  })

  it('getActiveJob: nada em voo e nada expirado → 404 NO_ACTIVE_JOB (como antes)', async () => {
    const { fastify } = fakeFastify([
      ['WITH expired', []],
      ['ORDER BY created_at DESC', []],
    ])
    await expect(getActiveJob(fastify, USER)).rejects.toMatchObject({ code: 'NO_ACTIVE_JOB' })
  })

  it('getPendingJob (chat e createDietJob): expira antes, então job preso não bloqueia', async () => {
    const { fastify, calls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET }]],
      ['ORDER BY created_at DESC', []],
    ])

    const r = await getPendingJob(fastify, USER)

    expect(r).toBeNull()
    expect(calls.findIndex(isExpire)).toBe(0)
  })

  it('/step: expira antes, devolve failed STALE sem chamar a IA nem pegar lock', async () => {
    const { fastify, calls, openaiCalls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET }]],
      ['FROM diet_jobs WHERE id', [staleRow]],
    ])

    const r = await processJobStep(fastify, USER, JOB)

    expect(calls.findIndex(isExpire)).toBe(0)
    expect(openaiCalls).toHaveLength(0)
    expect(calls.some((c) => c.sql.includes('SET step_started_at = NOW()'))).toBe(false)
    expect(r.status).toBe('failed')
    expect(r.errorCode).toBe('STALE')
  })

  it('status em voo não traz código de erro', async () => {
    const { fastify } = fakeFastify([['FROM diet_jobs WHERE id', [jobRow]]])
    const r = await getJob(fastify, USER, JOB)
    expect(r.status).toBe('running')
    expect(r.errorCode).toBeNull()
    expect(r.errorMessage).toBeNull()
  })

  it('falha antiga com texto livre (String(err)) vira DIET_STEP_FAILED', async () => {
    const { fastify } = fakeFastify([
      ['FROM diet_jobs WHERE id', [{ ...jobRow, status: 'failed', error: 'Error: ECONNRESET' }]],
    ])
    const r = await getJob(fastify, USER, JOB)
    expect(r.errorCode).toBe('DIET_STEP_FAILED')
    expect(r.error).toBe('Error: ECONNRESET')
    expect(r.errorMessage).toBeTruthy()
  })

  it('cada dia persistido avança updated_at (step lento mas saudável não expira)', async () => {
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
        ['SET days_completed', [{ id: JOB }]],
      ],
      {
        parse: async () => ({
          choices: [{ message: { parsed: cleanDay() } }],
          usage: null,
        }),
      },
    )
    await processJobStep(fastify, USER, JOB)
    const persist = calls.find((c) => c.sql.includes('SET days_completed'))
    expect(persist?.sql).toContain('updated_at = NOW()')
  })
})

describe('(c) retryJob num job failed STALE', () => {
  it('volta para running mantendo days_completed e devolve a draft', async () => {
    const { fastify, calls } = fakeFastify([['FROM diet_jobs WHERE id', [staleRow]]])

    const r = await retryJob(fastify, USER, JOB)

    expect(r.status).toBe('running')
    expect(r.daysCompleted).toBe(3)
    expect(r.error).toBeNull()
    expect(r.errorCode).toBeNull()
    expect(r.errorMessage).toBeNull()
    const reopen = calls.find((c) => c.sql.includes("SET status = 'running'"))
    expect(reopen?.sql).toContain('error = NULL')
    expect(reopen?.sql).toContain('updated_at = NOW()')
    expect(reopen?.sql).not.toContain('days_completed')
    expect(
      calls.some(
        (c) => c.sql.includes("UPDATE diets SET status = 'draft'") && c.params.includes(DIET),
      ),
    ).toBe(true)
  })

  it('retry de job preso (running parado) expira primeiro e então reabre', async () => {
    const { fastify, calls } = fakeFastify([
      ['WITH expired', [{ id: JOB, diet_id: DIET }]],
      ['FROM diet_jobs WHERE id', [staleRow]],
    ])

    const r = await retryJob(fastify, USER, JOB)

    expect(calls.findIndex(isExpire)).toBe(0)
    expect(r.status).toBe('running')
  })
})

describe('(d) orçamento de tempo do step', () => {
  it('MAX_DAY_ATTEMPTS × timeout cabe em 270 s (folga até o maxDuration de 300 s)', () => {
    expect(MAX_DAY_ATTEMPTS * DAY_GENERATION_TIMEOUT_MS).toBeLessThan(270_000)
  })

  it('generateDay chama a IA com maxRetries: 0 e o timeout do orçamento', async () => {
    const { fastify, openaiCalls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
        ['SET days_completed', [{ id: JOB }]],
      ],
      {
        parse: async () => ({
          choices: [{ message: { parsed: cleanDay() } }],
          usage: null,
        }),
      },
    )

    await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(1)
    expect(openaiCalls[0].options).toMatchObject({
      maxRetries: 0,
      timeout: DAY_GENERATION_TIMEOUT_MS,
    })
  })

  it('timeout da IA → failJob com STEP_TIMEOUT (lock liberado) e erro STEP_TIMEOUT', async () => {
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
      ],
      {
        parse: async () => {
          throw new APIConnectionTimeoutError()
        },
      },
    )

    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({
      code: 'STEP_TIMEOUT',
    })

    const fail = failJobCall(calls)
    expect(fail?.params).toContain('STEP_TIMEOUT')
    expect(fail?.params).toContain(LOCK_TOKEN)
  })

  it('o job failed por timeout expõe errorCode STEP_TIMEOUT na leitura', async () => {
    const { fastify } = fakeFastify([
      ['FROM diet_jobs WHERE id', [{ ...jobRow, status: 'failed', error: 'STEP_TIMEOUT' }]],
    ])
    const r = await getJob(fastify, USER, JOB)
    expect(r.errorCode).toBe('STEP_TIMEOUT')
    expect(r.errorMessage).toMatch(/demorou/i)
  })
})

describe('(e) dayNumber > total_days finaliza de verdade', () => {
  it('promove a draft a active, arquiva a anterior e completa o job', async () => {
    const { fastify, calls, openaiCalls } = fakeFastify([
      ['FROM diet_jobs WHERE id', [{ ...jobRow, days_completed: 7 }]],
      ["SET status = 'completed'", [{ id: JOB }]],
    ])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(0)
    expect(r.status).toBe('completed')
    expect(r.daysCompleted).toBe(7)
    const complete = calls.find((c) => c.sql.includes("SET status = 'completed'"))
    // Condicional: dois chamadores não finalizam (nem postam no feed) em dobro.
    expect(complete?.sql).toContain("status IN ('pending', 'running')")
    const replaced = calls.find((c) => c.sql.includes("SET status = 'replaced'"))
    expect(replaced?.params).toContain(USER)
    expect(replaced?.params).toContain(DIET)
    const activated = calls.find((c) => c.sql.includes("SET status = 'active'"))
    expect(activated?.params).toContain(DIET)
  })
})

describe('contrato da resposta (jobStatusSchema)', () => {
  it('o schema das rotas de job expõe errorCode e errorMessage (zod descartaria campos fora dele)', async () => {
    const { jobStatusSchema } = await import('./diets.routes.js')
    const { fastify } = fakeFastify([['FROM diet_jobs WHERE id', [staleRow]]])
    const status = await getJob(fastify, USER, JOB)
    expect(jobStatusSchema.parse(status)).toEqual(status)
    expect(jobStatusSchema.parse(status).errorCode).toBe('STALE')
  })
})
