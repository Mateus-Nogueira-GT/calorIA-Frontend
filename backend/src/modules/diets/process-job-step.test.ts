import { describe, expect, it } from 'vitest'
import type { AiSingleDay, CollectedUserData } from '../../shared/diet-ai-schema.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { computeTargets, processJobStep } from './jobs.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const DIET = '44444444-4444-4444-4444-444444444444'
// OP1: token real (não {id: JOB}) — precisa ser um valor que a rota de
// liberação possa carregar de volta nos params, senão o teste não pega uma
// fenceação quebrada (foi exatamente assim que a revisão anterior escapou:
// acquiredAt saía `undefined` em todo teste e nunca era comparado de verdade).
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
  allergies: ['amendoim'],
  food_preferences: null,
  message_to_user: 'ok',
  health_conditions: [],
}
const targets = computeTargets(input)

function dayWith(food: string): AiSingleDay {
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
          food_name: food,
          quantity_g: 150,
          unit: 'g',
          calories: kcal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
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
  days_completed: 0,
  error: null,
}

function setup(days: AiSingleDay[]) {
  const queue = [...days]
  return fakeFastify(
    [
      ['FROM diet_jobs WHERE id', [jobRow]],
      ['SET step_started_at', [{ step_token: LOCK_TOKEN }]], // OP1: lock adquirido
      ['SET days_completed', [{ id: JOB }]],
    ],
    {
      parse: async () => ({
        choices: [{ message: { parsed: queue.shift() ?? null } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    },
  )
}

describe('processJobStep — guardrails do dia (O4)', () => {
  it('dia limpo: uma chamada, persiste', async () => {
    const { fastify, calls, openaiCalls } = setup([dayWith('Frango grelhado')])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(1)
    expect(r.daysCompleted).toBe(1)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(true)
  })

  it('alérgeno na 1ª tentativa: regenera com feedback e persiste a 2ª', async () => {
    const { fastify, calls, openaiCalls } = setup([
      dayWith('Pasta de amendoim'),
      dayWith('Frango grelhado'),
    ])

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(2)
    const segunda = openaiCalls[1].params as { messages: { content: string }[] }
    expect(segunda.messages[1].content).toContain('REJEITADA')
    expect(segunda.messages[1].content).toContain('Pasta de amendoim')
    expect(r.daysCompleted).toBe(1)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(true)
    // Não basta "algum dia foi persistido": precisa ser o da 2ª tentativa
    // (limpa), não o da 1ª (com o alérgeno) — checa o conteúdo, não só a
    // presença do INSERT.
    const itemInserts = calls.filter((c) => c.sql.includes('INSERT INTO diet_items'))
    expect(itemInserts.some((c) => c.params.includes('Frango grelhado'))).toBe(true)
    expect(calls.some((c) => c.params.includes('Pasta de amendoim'))).toBe(false)
  })

  it('alérgeno nas 2 tentativas: job failed com ALLERGEN_IN_OUTPUT, nada persistido', async () => {
    const { fastify, calls, openaiCalls } = setup([
      dayWith('Pasta de amendoim'),
      dayWith('Amendoim torrado'),
    ])

    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({
      code: 'ALLERGEN_IN_OUTPUT',
    })

    expect(openaiCalls).toHaveLength(2)
    // As três tabelas do dia — não só diet_days: meals e items ficam dentro
    // da mesma transação, mas a garantia deve ser afirmada, não inferida.
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_meals'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_items'))).toBe(false)
    const fail = calls.find(
      (c) => c.sql.includes("status = 'failed'") && c.sql.includes('diet_jobs'),
    )
    expect(fail?.params).toContain('ALLERGEN_IN_OUTPUT')
  })

  it('erro de rede na IA continua virando DIET_STEP_FAILED', async () => {
    const { fastify } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
      ],
      {
        parse: async () => {
          throw new Error('ECONNRESET')
        },
      },
    )
    await expect(processJobStep(fastify, USER, JOB)).rejects.toBeInstanceOf(AppError)
    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({
      code: 'DIET_STEP_FAILED',
    })
  })

  it('no último dia, anexa o marcador de conclusão ao chat_history da conversa', async () => {
    const CONV = '22222222-2222-2222-2222-222222222222'
    const queue = [dayWith('Frango grelhado')]
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [{ ...jobRow, conversation_id: CONV, days_completed: 6 }]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
        ['SET days_completed', [{ id: JOB }]],
      ],
      {
        parse: async () => ({
          choices: [{ message: { parsed: queue.shift() ?? null } }],
          usage: null,
        }),
      },
    )

    const r = await processJobStep(fastify, USER, JOB)

    expect(r.status).toBe('completed')
    const upd = calls.find(
      (c) => c.sql.includes('UPDATE chat_history') && c.sql.includes('messages ||'),
    )
    expect(upd).toBeDefined()
    expect(
      String(upd?.params.find((p) => typeof p === 'string' && p.includes('Dieta concluída'))),
    ).toContain('7 dias')
  })
})

describe('processJobStep — lock em voo (OP1)', () => {
  it('com outro step em voo, devolve o status atual SEM chamar a IA', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', []], // 0 linhas: lock não adquirido
      ],
      {
        parse: async () => {
          throw new Error('não deveria chamar')
        },
      },
    )

    const r = await processJobStep(fastify, USER, JOB)

    expect(openaiCalls).toHaveLength(0)
    expect(r.daysCompleted).toBe(0)
    expect(r.status).toBe('running')
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_days'))).toBe(false)
  })

  it('a query do lock só adquire se NULL ou expirado há 300 s (maxDuration da function)', async () => {
    const { fastify, calls } = setup([dayWith('Frango grelhado')])
    await processJobStep(fastify, USER, JOB)
    const lock = calls.find((c) => c.sql.includes('SET step_started_at = NOW()'))
    expect(lock?.sql).toContain('make_interval')
    expect(lock?.params).toContain(300)
    expect(lock?.sql).toContain('RETURNING step_token')
  })

  it('libera o lock (started_at e token) ao persistir o dia', async () => {
    const { fastify, calls } = setup([dayWith('Frango grelhado')])
    await processJobStep(fastify, USER, JOB)
    const persist = calls.find((c) => c.sql.includes('SET days_completed'))
    expect(persist?.sql).toContain('step_started_at = NULL')
    expect(persist?.sql).toContain('step_token = NULL')
  })

  it('libera o lock ao falhar, carregando o MESMO token que a aquisição devolveu', async () => {
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
      ],
      {
        parse: async () => {
          throw new Error('ECONNRESET')
        },
      },
    )
    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({
      code: 'DIET_STEP_FAILED',
    })
    const fail = calls.find(
      (c) => c.sql.includes("status = 'failed'") && c.sql.includes('diet_jobs'),
    )
    expect(fail?.sql).toContain('step_started_at = NULL')
    expect(fail?.sql).toContain('step_token = NULL')
    // Finding 3 da revisão: a liberação é fenceada por token, não um UPDATE
    // incondicional — e o token no WHERE precisa ser O MESMO que saiu do
    // RETURNING da aquisição (é exatamente esse elo que quebrou na revisão
    // anterior, sem nenhum teste capaz de flagrar).
    expect(fail?.sql).toContain('AND step_token =')
    expect(fail?.params).toContain(LOCK_TOKEN)
  })

  it('falha de persistência que NÃO é o sentinel de concorrência limpa o lock (started_at e token) e falha o job (finding 1)', async () => {
    const { fastify, calls } = fakeFastify(
      [
        ['FROM diet_jobs WHERE id', [jobRow]],
        ['SET step_started_at', [{ step_token: LOCK_TOKEN }]],
        ['INSERT INTO diet_days', new Error('conexão caiu')],
      ],
      {
        parse: async () => ({
          choices: [{ message: { parsed: dayWith('Frango grelhado') } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      },
    )

    await expect(processJobStep(fastify, USER, JOB)).rejects.toMatchObject({
      code: 'DIET_STEP_FAILED',
    })

    // Não basta o código do erro: precisa provar que failJob rodou (job
    // marcado failed) E que o lock foi liberado com o token certo — não
    // deixado preso pelos 300s inteiros por um erro que não é o
    // CONCURRENT_STEP esperado.
    const fail = calls.find(
      (c) => c.sql.includes("status = 'failed'") && c.sql.includes('diet_jobs'),
    )
    expect(fail).toBeDefined()
    expect(fail?.sql).toContain('step_started_at = NULL')
    expect(fail?.sql).toContain('step_token = NULL')
    expect(fail?.params).toContain(LOCK_TOKEN)
  })
})
