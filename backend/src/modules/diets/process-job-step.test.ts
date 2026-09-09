import { describe, expect, it } from 'vitest'
import type { AiSingleDay, CollectedUserData } from '../../shared/diet-ai-schema.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { computeTargets, processJobStep } from './jobs.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const JOB = '33333333-3333-3333-3333-333333333333'
const DIET = '44444444-4444-4444-4444-444444444444'

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
    const { fastify } = fakeFastify([['FROM diet_jobs WHERE id', [jobRow]]], {
      parse: async () => {
        throw new Error('ECONNRESET')
      },
    })
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
