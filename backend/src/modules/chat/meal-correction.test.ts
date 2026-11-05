import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeFastify, textCompletion, toolCompletion } from '../../shared/testing/fake-fastify.js'

vi.mock('../food-log/food-log.service.js', () => ({
  listMeals: vi.fn(),
  updateMeal: vi.fn(),
}))

const { listMeals, updateMeal } = await import('../food-log/food-log.service.js')
const { applyMealCorrection, proposeMealCorrection } = await import('./meal-correction.js')
const { sendChatMessage } = await import('./chat.service.js')

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const PORK = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  name: 'Carne suína grelhada',
  calories: 420,
  protein: 38,
  carbs: 0,
  fat: 29,
  fiber: null,
  weightGrams: 180,
  loggedAt: '2026-11-03 23:14:00+00',
  mealType: 'dinner' as const,
}
const SALMON = {
  meal_ref: 'abcdef',
  name: 'Salmão grelhado',
  calories: 374,
  protein: 40,
  carbs: 0,
  fat: 24,
  fiber: 0,
  message_to_user: 'Pronto, troquei para salmão grelhado (180 g).',
}

beforeEach(() => {
  vi.mocked(listMeals).mockReset()
  vi.mocked(updateMeal).mockReset()
  vi.mocked(updateMeal).mockImplementation(async (_f, _u, id, data) => ({ ...PORK, ...data, id }))
})

describe('applyMealCorrection (coach corrige o registro, 04/11)', () => {
  it('troca nome e valores mantendo peso e tipo da refeição', async () => {
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) =>
      date === '2026-11-03' ? [PORK] : [],
    )
    const { fastify } = fakeFastify()
    const r = await applyMealCorrection(fastify, USER, SALMON, '2026-11-04')
    expect(r).toMatchObject({ ok: true, mealId: PORK.id, date: '2026-11-03' })
    expect(updateMeal).toHaveBeenCalledWith(fastify, USER, PORK.id, {
      name: 'Salmão grelhado',
      calories: 374,
      protein: 40,
      carbs: 0,
      fat: 24,
      fiber: 0,
      mealType: 'dinner',
    })
  })

  it('ref que não está em hoje nem ontem: nada é gravado', async () => {
    vi.mocked(listMeals).mockResolvedValue([])
    const r = await applyMealCorrection(fakeFastify().fastify, USER, SALMON, '2026-11-04')
    expect(r.ok).toBe(false)
    expect(updateMeal).not.toHaveBeenCalled()
  })

  it('valores impossíveis (macros pesando mais que o alimento): recusa', async () => {
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) =>
      date === '2026-11-04' ? [PORK] : [],
    )
    const r = await applyMealCorrection(
      fakeFastify().fastify,
      USER,
      { ...SALMON, protein: 999 },
      '2026-11-04',
    )
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/não fecham com o peso/) })
    expect(updateMeal).not.toHaveBeenCalled()
  })

  it('a mesma ref em dois dias é ambígua: nada é gravado', async () => {
    vi.mocked(listMeals).mockResolvedValue([PORK])
    const r = await applyMealCorrection(fakeFastify().fastify, USER, SALMON, '2026-11-04')
    expect(r.ok).toBe(false)
    expect(updateMeal).not.toHaveBeenCalled()
  })

  it('kcal incoerente com os macros é recalculada', async () => {
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) =>
      date === '2026-11-04' ? [PORK] : [],
    )
    await applyMealCorrection(
      fakeFastify().fastify,
      USER,
      { ...SALMON, calories: 900 },
      '2026-11-04',
    )
    // 4·40 + 4·0 + 9·24 = 376
    expect(vi.mocked(updateMeal).mock.calls[0][3].calories).toBe(376)
  })
})

describe('sendChatMessage com a tool de correção', () => {
  it('sem job de dieta, oferece as duas tools', async () => {
    const { fastify, openaiCalls } = fakeFastify([], {
      chatCreate: async () => textCompletion('oi'),
    })
    vi.mocked(listMeals).mockResolvedValue([])
    await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })
    const names = (openaiCalls[0].params.tools as { function: { name: string } }[]).map(
      (t) => t.function.name,
    )
    expect(names).toEqual(['collect_diet_data', 'update_logged_meal'])
  })

  it('a tool corrige e a resposta traz meal_updated e a mensagem do coach', async () => {
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) =>
      date === '2026-11-04' ? [PORK] : [],
    )
    const { fastify } = fakeFastify([], {
      chatCreate: async () => toolCompletion(SALMON, 'update_logged_meal'),
    })
    const r = await sendChatMessage(fastify, USER, {
      message: 'sim, pode atualizar',
      conversation_id: CONV,
      date: '2026-11-04',
    })
    expect(r.meal_updated).toEqual({ id: PORK.id, date: '2026-11-04' })
    expect(r.message.content).toBe('Pronto, troquei para salmão grelhado (180 g).')
  })

  it('correção recusada: explica em texto, sem meal_updated', async () => {
    vi.mocked(listMeals).mockResolvedValue([])
    const { fastify } = fakeFastify([], {
      chatCreate: async () => toolCompletion(SALMON, 'update_logged_meal'),
    })
    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })
    expect(r.meal_updated ?? null).toBeNull()
    expect(r.message.content).toMatch(/não encontrei esse registro/i)
  })
})

describe('proposeMealCorrection (05/11, M3/M4/M6)', () => {
  const onDay = (day: string) =>
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) => (date === day ? [PORK] : []))

  it('propõe sem gravar, com os valores normalizados e o texto do servidor', async () => {
    onDay('2026-11-04')
    const r = await proposeMealCorrection(
      fakeFastify().fastify,
      USER,
      { ...SALMON, calories: 900, message_to_user: 'Boa, vamos ajustar!' },
      '2026-11-04',
    )
    expect(updateMeal).not.toHaveBeenCalled()
    expect(r).toMatchObject({
      ok: true,
      proposal: {
        id: PORK.id,
        date: '2026-11-04',
        currentName: 'Carne suína grelhada',
        name: 'Salmão grelhado',
        weightGrams: 180,
        mealType: 'dinner',
        calories: 376, // recalculada: 4·40 + 9·24
        protein: 40,
        fat: 24,
      },
    })
    // O texto cita o número recalculado, não os 900 do modelo.
    expect(r.message).toBe(
      'Boa, vamos ajustar!\n\nPara os mesmos 180 g de "Salmão grelhado": 376 kcal · P 40 g · ' +
        'C 0 g · G 24 g. Toque em Atualizar registro para salvar.',
    )
  })

  it('frase do modelo com números fica de fora (podia contradizer o cartão)', async () => {
    onDay('2026-11-04')
    const r = await proposeMealCorrection(
      fakeFastify().fastify,
      USER,
      { ...SALMON, message_to_user: 'Salmão tem 900 kcal.' },
      '2026-11-04',
    )
    expect(r.message).not.toContain('900')
    expect(r.message.startsWith('Para os mesmos 180 g')).toBe(true)
  })

  it('ref de 6 dias atrás é encontrada; de 7 dias, não', async () => {
    onDay('2026-10-29')
    const found = await proposeMealCorrection(fakeFastify().fastify, USER, SALMON, '2026-11-04')
    expect(found.ok).toBe(true)
    onDay('2026-10-28')
    const missing = await proposeMealCorrection(fakeFastify().fastify, USER, SALMON, '2026-11-04')
    expect(missing).toMatchObject({ ok: false, message: expect.stringMatching(/últimos 7 dias/) })
  })
})

describe('sendChatMessage com o app que mostra a proposta', () => {
  it("client_features ['meal_proposal'] → só a tool de proposta, e a resposta traz o cartão", async () => {
    vi.mocked(listMeals).mockImplementation(async (_f, _u, date) =>
      date === '2026-11-04' ? [PORK] : [],
    )
    const { fastify, openaiCalls } = fakeFastify([], {
      chatCreate: async () => toolCompletion(SALMON, 'propose_meal_correction'),
    })
    const r = await sendChatMessage(fastify, USER, {
      message: 'não era carne suína, era salmão',
      conversation_id: CONV,
      date: '2026-11-04',
      client_features: ['meal_proposal'],
    })
    const names = (openaiCalls[0].params.tools as { function: { name: string } }[]).map(
      (t) => t.function.name,
    )
    expect(names).toEqual(['collect_diet_data', 'propose_meal_correction'])
    expect(updateMeal).not.toHaveBeenCalled()
    expect(r.meal_proposal).toMatchObject({ id: PORK.id, name: 'Salmão grelhado' })
    expect(r.message.content).toMatch(/Toque em Atualizar registro/)
    const system = (openaiCalls[0].params.messages as { content: string }[])[0].content
    expect(system).toMatch(/propose_meal_correction JÁ NESTA resposta/)
    expect(system).not.toMatch(/Só chame update_logged_meal/)
  })

  it('app sem a marca que recebe a tool de proposta (não oferecida) não grava nada', async () => {
    vi.mocked(listMeals).mockResolvedValue([PORK])
    const { fastify } = fakeFastify([], {
      chatCreate: async () => toolCompletion(SALMON, 'propose_meal_correction'),
    })
    await expect(
      sendChatMessage(fastify, USER, { message: 'x', conversation_id: CONV }),
    ).rejects.toThrow()
    expect(updateMeal).not.toHaveBeenCalled()
  })
})
