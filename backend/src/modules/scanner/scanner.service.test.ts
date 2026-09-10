import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { analyzePhoto } from './scanner.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const IMG = 'data:image/jpeg;base64,AAAA'
const analysis = {
  is_food: true,
  name: 'Arroz e feijão',
  calories: 500,
  protein: 20,
  carbs: 80,
  fat: 8,
  confidence: 0.4,
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
      notFood: false,
      item: {
        name: 'Banana',
        calories: 90,
        protein: 1,
        carbs: 23,
        fat: 0,
        confidence: 0.9,
        uncertain: false,
      },
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
      [['FROM scan_cache', [{ result: { notFood: true } }]]],
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
})
