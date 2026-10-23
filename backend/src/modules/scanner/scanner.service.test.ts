import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { analyzePhoto } from './scanner.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const IMG = 'data:image/jpeg;base64,AAAA'
const analysis = {
  is_food: true,
  items: [
    {
      weightGrams: 400,
      name: 'Arroz e feijão',
      calories: 500,
      protein: 20,
      carbs: 80,
      fat: 8,
      fiber: 7,
      confidence: 0.4,
    },
  ],
}

describe('analyzePhoto — guardrails e cache (OP3)', () => {
  it('sem cache: chama a IA, devolve uncertain e grava no cache', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
    })

    const r = await analyzePhoto(fastify, IMG, USER)

    expect(openaiCalls).toHaveLength(1)
    expect(r.items[0].uncertain).toBe(true)
    expect(r.items[0].name).toBe('Arroz e feijão')
    expect(calls.some((c) => c.sql.includes('INSERT INTO scan_cache'))).toBe(true)
  })

  it('com cache (24h): devolve o resultado guardado SEM chamar a IA', async () => {
    const cached = {
      version: 2,
      notFood: false,
      items: [
        {
          weightGrams: 100,
          fiber: null,
          name: 'Banana',
          calories: 90,
          protein: 1,
          carbs: 23,
          fat: 0,
          confidence: 0.9,
          uncertain: false,
        },
      ],
    }
    const { fastify, openaiCalls } = fakeFastify([['FROM scan_cache', [{ result: cached }]]], {
      parse: async () => {
        throw new Error('não deveria chamar')
      },
    })

    const r = await analyzePhoto(fastify, IMG, USER)

    expect(openaiCalls).toHaveLength(0)
    expect(r.items[0].name).toBe('Banana')
    expect(r.items[0].id).toBeTruthy()
  })

  it('cache de "não é comida" também evita a chamada', async () => {
    const { fastify, openaiCalls } = fakeFastify(
      [['FROM scan_cache', [{ result: { version: 2, notFood: true } }]]],
      {
        parse: async () => {
          throw new Error('não deveria chamar')
        },
      },
    )
    await expect(analyzePhoto(fastify, IMG, USER)).rejects.toMatchObject({ code: 'NOT_FOOD' })
    expect(openaiCalls).toHaveLength(0)
  })

  it('falha ao ler o cache: segue sem cache (fail-open) e chama a IA normalmente', async () => {
    const { fastify, openaiCalls } = fakeFastify(
      [['FROM scan_cache', new Error('tabela scan_cache fora do ar')]],
      { parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }) },
    )

    const r = await analyzePhoto(fastify, IMG, USER)

    expect(openaiCalls).toHaveLength(1)
    expect(r.items[0].name).toBe('Arroz e feijão')
  })

  it('falha ao gravar o cache: a request ainda retorna com sucesso (best-effort)', async () => {
    const { fastify, logs } = fakeFastify([['INSERT INTO scan_cache', new Error('disco cheio')]], {
      parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
    })

    const r = await analyzePhoto(fastify, IMG, USER)
    expect(r.items[0].name).toBe('Arroz e feijão')

    // A gravação do cache não é aguardada (fire-and-forget); damos um tick
    // para a rejeição ser tratada antes do teste terminar — mesmo padrão de
    // src/shared/ai-usage.test.ts para logAiUsage.
    await new Promise((resolve) => setImmediate(resolve))
    expect(logs.some((l) => l.level === 'warn')).toBe(true)
  })

  it('devolve a fibra estimada pela IA', async () => {
    const { fastify } = fakeFastify([], {
      parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
    })
    const r = await analyzePhoto(fastify, IMG, USER)
    expect(r.items[0].fiber).toBe(7)
  })

  it('cache atual preserva fibra desconhecida e peso', async () => {
    const cached = {
      version: 2,
      notFood: false,
      items: [
        {
          weightGrams: 100,
          fiber: null,
          name: 'Banana',
          calories: 90,
          protein: 1,
          carbs: 23,
          fat: 0,
          confidence: 0.9,
          uncertain: false,
        },
      ],
    }
    const { fastify } = fakeFastify([['FROM scan_cache', [{ result: cached }]]])
    const r = await analyzePhoto(fastify, IMG, USER)
    expect(r.items[0].fiber).toBeNull()
  })
})

describe('scanner por alimento e peso', () => {
  it('PF devolve arroz e frango separados com os respectivos pesos e macros', async () => {
    const items = [
      {
        name: 'Arroz',
        weightGrams: 200,
        calories: 260,
        protein: 5,
        carbs: 56,
        fat: 1,
        fiber: 2,
        confidence: 0.8,
      },
      {
        name: 'Frango',
        weightGrams: 200,
        calories: 330,
        protein: 62,
        carbs: 0,
        fat: 7,
        fiber: 0,
        confidence: 0.8,
      },
    ]
    const { fastify } = fakeFastify([], {
      parse: async () => ({
        choices: [{ message: { parsed: { is_food: true, items } } }],
        usage: null,
      }),
    })
    const result = await analyzePhoto(fastify, IMG, USER)
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject(items[0])
    expect(result.items[1]).toMatchObject(items[1])
  })
})

describe('contrato e limites do scanner por porção', () => {
  const food = {
    name: 'Arroz de panela',
    weightGrams: 3000,
    calories: 6000,
    protein: 200,
    carbs: 1000,
    fat: 133,
    fiber: 30,
    confidence: 0.58,
  }
  const provider = (parsed: unknown) => ({
    parse: async () => ({ choices: [{ message: { parsed } }], usage: null }),
  })

  it('panela inteira conserva peso e energia acima do teto de uma porção', async () => {
    const { fastify } = fakeFastify([], provider({ is_food: true, items: [food] }))
    const result = await analyzePhoto(fastify, IMG, USER)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ name: food.name, weightGrams: 3000, calories: 6000 })
  })
  it.each([0, -1, Number.POSITIVE_INFINITY, 100001])(
    'peso inválido %s produz erro recuperável',
    async (weightGrams) => {
      const { fastify } = fakeFastify(
        [],
        provider({ is_food: true, items: [{ ...food, weightGrams }] }),
      )
      await expect(analyzePhoto(fastify, IMG, USER)).rejects.toMatchObject({ code: 'VISION_ERROR' })
    },
  )
  it('não aceita análise vazia como refeição', async () => {
    const { fastify } = fakeFastify([], provider({ is_food: true, items: [] }))
    await expect(analyzePhoto(fastify, IMG, USER)).rejects.toMatchObject({ code: 'VISION_ERROR' })
  })
  it('sem comida mantém NOT_FOOD e cache negativo', async () => {
    const { fastify, calls } = fakeFastify([], provider({ is_food: false, items: [] }))
    await expect(analyzePhoto(fastify, IMG, USER)).rejects.toMatchObject({ code: 'NOT_FOOD' })
    expect(calls.find((c) => c.sql.includes('INSERT INTO scan_cache'))?.params[1]).toContain(
      '"notFood":true',
    )
  })
  it('cache agregado antigo é ignorado e substituído por itens com peso', async () => {
    const { fastify, openaiCalls } = fakeFastify(
      [
        [
          'FROM scan_cache',
          [{ result: { notFood: false, item: { ...food, weightGrams: undefined } } }],
        ],
      ],
      provider({ is_food: true, items: [food] }),
    )
    const result = await analyzePhoto(fastify, IMG, USER)
    expect(openaiCalls).toHaveLength(1)
    expect(result.items[0].weightGrams).toBe(3000)
  })
  it('cache novo retorna vários alimentos com IDs novos sem chamar provedor', async () => {
    const cached = {
      version: 2,
      notFood: false,
      items: [
        { ...food, uncertain: false },
        { ...food, name: 'Salada', uncertain: false },
      ],
    }
    const { fastify, openaiCalls } = fakeFastify([['FROM scan_cache', [{ result: cached }]]])
    const first = await analyzePhoto(fastify, IMG, USER)
    const second = await analyzePhoto(fastify, IMG, USER)
    expect(openaiCalls).toHaveLength(0)
    expect(first.items).toHaveLength(2)
    expect(first.items[0].id).not.toBe(first.items[1].id)
    expect(first.items[0].id).not.toBe(second.items[0].id)
  })
})
