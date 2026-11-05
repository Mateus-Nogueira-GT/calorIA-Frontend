import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion, toolCompletion } from '../../shared/testing/fake-fastify.js'
import type { TodayPlan } from '../diets/diets.schemas.js'
import {
  actionFeatures,
  capabilitiesInstruction,
  proposeCompletePlanMeal,
  proposeLogMeal,
  proposeLogWeight,
} from './action-proposals.js'
import { CAPABILITIES_INSTRUCTION, sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

// Texto do PR #96 — sem marcas de ação, o coach continua dizendo exatamente isto.
const PR96_TEXT =
  'O QUE VOCÊ CONSEGUE FAZER: orientar sobre alimentação; analisar o dia, o plano e os registros ' +
  'do CONTEXTO; propor a correção de um registro do diário (veja a instrução de correção); gerar ' +
  'um plano novo, só quando pedido. O QUE VOCÊ NÃO CONSEGUE FAZER — explique e indique o caminho ' +
  'no app: registrar refeição (Diário › Adicionar refeição, ou o Scanner); apagar um registro ' +
  '(lixeira do registro no Diário); marcar uma refeição do plano como feita (tela Hoje); registrar ' +
  'o peso (Evolução); trocar um item do plano (o app não tem essa opção: sugira a troca ' +
  'equivalente e diga que a pessoa pode segui-la). NUNCA diga "registrei", "apaguei", "marquei", ' +
  '"atualizei" ou "troquei" sem ter feito isso por uma das suas ferramentas.'

describe('capabilitiesInstruction', () => {
  it('sem marcas = texto do PR #96', () => {
    expect(capabilitiesInstruction()).toBe(PR96_TEXT)
    expect(CAPABILITIES_INSTRUCTION).toBe(PR96_TEXT)
  })

  it('cada marca sai de "não consegue" e entra em "consegue propor"', () => {
    const t = capabilitiesInstruction(['log_meal', 'log_weight'])
    expect(t).toContain('propose_log_meal')
    expect(t).toContain('propose_log_weight')
    expect(t).not.toContain('registrar refeição (Diário')
    expect(t).not.toContain('registrar o peso (Evolução)')
    // Continuam fora: apagar, marcar, trocar.
    expect(t).toContain('apagar um registro (lixeira')
    expect(t).toContain('marcar uma refeição do plano como feita (tela Hoje)')
    expect(t).toMatch(/propose_\* NÃO gravam/)
  })

  it('só reconhece as marcas conhecidas', () => {
    expect(actionFeatures(['meal_proposal', 'log_meal', 'x'])).toEqual(['log_meal'])
  })
})

describe('proposeLogMeal (A1)', () => {
  const eggs = {
    name: '2 ovos cozidos',
    weight_grams: 100,
    calories: 155,
    protein: 13,
    carbs: 1,
    fat: 11,
    fiber: 0,
    meal_type: 'breakfast',
    date: 'today',
    message_to_user: 'Boa escolha!',
  }

  it('proposta com os valores normalizados e o texto do servidor', () => {
    const r = proposeLogMeal(eggs, '2026-11-05')
    expect(r.proposal).toEqual({
      kind: 'log_meal',
      name: '2 ovos cozidos',
      weightGrams: 100,
      calories: 155,
      protein: 13,
      carbs: 1,
      fat: 11,
      fiber: 0,
      mealType: 'breakfast',
      date: '2026-11-05',
    })
    expect(r.message).toBe(
      'Boa escolha!\n\nPara registrar no café da manhã de hoje: "2 ovos cozidos" (100 g) — 155 kcal · ' +
        'P 13 g · C 1 g · G 11 g. Toque em Adicionar ao Diário para salvar.',
    )
  })

  it('kcal incoerente é recalculada; "yesterday" vira a data de ontem', () => {
    const r = proposeLogMeal({ ...eggs, calories: 900, date: 'yesterday' }, '2026-11-01')
    expect(r.proposal).toMatchObject({ calories: 155, date: '2026-10-31' })
  })

  it('macros acima do peso ou 999.999 kcal → sem proposta', () => {
    expect(proposeLogMeal({ ...eggs, protein: 300 }, '2026-11-05').proposal).toBeNull()
    expect(proposeLogMeal({ ...eggs, calories: 999_999 }, '2026-11-05').proposal).toBeNull()
  })
})

describe('proposeLogWeight (A2)', () => {
  it('sem registro no dia: proposta simples', async () => {
    const { fastify } = fakeFastify([
      ['FROM weight_entries', [{ date: '2026-11-01', weight_kg: '79' }]],
    ])
    const r = await proposeLogWeight(fastify, USER, { weight_kg: 78, date: 'today' }, '2026-11-05')
    expect(r.proposal).toEqual({
      kind: 'log_weight',
      weightKg: 78,
      date: '2026-11-05',
      replaces: null,
      bigChange: false,
    })
    expect(r.message).toBe(
      'Para registrar na Evolução: 78 kg hoje. Toque em Registrar na Evolução para salvar.',
    )
  })

  it('com registro no dia: diz o que substitui; salto de 7 kg pede conferência', async () => {
    const { fastify } = fakeFastify([
      [
        'FROM weight_entries',
        [
          { date: '2026-11-05', weight_kg: '80.2' },
          { date: '2026-11-01', weight_kg: '79' },
        ],
      ],
    ])
    const r = await proposeLogWeight(fastify, USER, { weight_kg: 86, date: 'today' }, '2026-11-05')
    expect(r.proposal).toMatchObject({ replaces: 80.2, bigChange: true })
    expect(r.message).toContain('Substitui o peso de hoje (80,2 kg).')
    expect(r.message).toContain('Confira: é 7 kg diferente do último registro (79 kg).')
  })

  it('peso impossível → sem proposta e sem consulta', async () => {
    const { fastify, calls } = fakeFastify()
    const r = await proposeLogWeight(fastify, USER, { weight_kg: 0.5, date: 'today' }, '2026-11-05')
    expect(r.proposal).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('proposeCompletePlanMeal (A3)', () => {
  const plan = {
    meals: [
      {
        id: 'abcdef12-0000-0000-0000-000000000001',
        title: 'Almoço',
        calories: 650,
        completedToday: false,
      },
      {
        id: '9f8e7d12-0000-0000-0000-000000000002',
        title: 'Café da manhã',
        calories: 400,
        completedToday: true,
      },
    ],
  } as unknown as TodayPlan

  it('ref válida → proposta', () => {
    const r = proposeCompletePlanMeal({ plan_meal_ref: 'plano abcdef' }, plan)
    expect(r.proposal).toEqual({
      kind: 'complete_plan_meal',
      mealId: 'abcdef12-0000-0000-0000-000000000001',
      title: 'Almoço',
      calories: 650,
    })
  })

  it('já concluída → sem proposta; ref inválida → indica a tela Hoje', () => {
    expect(proposeCompletePlanMeal({ plan_meal_ref: '9f8e7d' }, plan)).toEqual({
      proposal: null,
      message: '"Café da manhã" já está marcada como feita hoje.',
    })
    expect(proposeCompletePlanMeal({ plan_meal_ref: 'zzzzzz' }, plan).message).toMatch(/tela Hoje/)
  })
})

describe('sendChatMessage com as marcas de ação', () => {
  const names = (params: Record<string, unknown>) =>
    (params.tools as { function: { name: string } }[]).map((t) => t.function.name)

  it('app novo recebe as ferramentas de ação; app antigo não', async () => {
    const novo = fakeFastify([], { chatCreate: async () => textCompletion('oi') })
    await sendChatMessage(novo.fastify, USER, {
      message: 'oi',
      conversation_id: CONV,
      client_features: ['meal_proposal', 'log_meal', 'log_weight', 'complete_plan_meal'],
    })
    expect(names(novo.openaiCalls[0].params)).toEqual([
      'collect_diet_data',
      'propose_meal_correction',
      'propose_log_meal',
      'propose_log_weight',
      'propose_complete_plan_meal',
    ])
    const antigo = fakeFastify([], { chatCreate: async () => textCompletion('oi') })
    await sendChatMessage(antigo.fastify, USER, { message: 'oi', conversation_id: CONV })
    expect(names(antigo.openaiCalls[0].params)).toEqual(['collect_diet_data', 'update_logged_meal'])
  })

  it('tool de ação → action_proposal, sem gravar nada no diário', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () =>
        toolCompletion(
          {
            name: '2 ovos cozidos',
            weight_grams: 100,
            calories: 155,
            protein: 13,
            carbs: 1,
            fat: 11,
            fiber: 0,
            meal_type: 'breakfast',
            date: 'today',
            message_to_user: 'Anotado!',
          },
          'propose_log_meal',
        ),
    })
    const r = await sendChatMessage(fastify, USER, {
      message: 'registra 2 ovos no café',
      conversation_id: CONV,
      date: '2026-11-05',
      client_features: ['log_meal'],
    })
    expect(r.action_proposal).toMatchObject({ kind: 'log_meal', date: '2026-11-05' })
    expect(r.message.content).toMatch(/Toque em Adicionar ao Diário/)
    expect(calls.some((c) => c.sql.includes('INSERT INTO meals'))).toBe(false)
  })

  it('tool de ação não oferecida (app sem a marca) é ignorada', async () => {
    const { fastify } = fakeFastify([], {
      chatCreate: async () =>
        toolCompletion({ weight_kg: 78, date: 'today' }, 'propose_log_weight'),
    })
    await expect(
      sendChatMessage(fastify, USER, { message: 'meu peso é 78', conversation_id: CONV }),
    ).rejects.toThrow()
  })
})
