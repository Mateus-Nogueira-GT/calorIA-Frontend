import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { buildModelsField, logAiUsage, parseFallbackModels } from './ai-usage.js'

describe('parseFallbackModels', () => {
  it('CSV com espaços e vazios vira lista limpa', () => {
    expect(parseFallbackModels(' openai/gpt-4.1 , , google/gemini-2.5-pro ')).toEqual([
      'openai/gpt-4.1',
      'google/gemini-2.5-pro',
    ])
  })

  it('undefined/vazio → lista vazia', () => {
    expect(parseFallbackModels(undefined)).toEqual([])
    expect(parseFallbackModels('')).toEqual([])
    expect(parseFallbackModels('  ,  ')).toEqual([])
  })
})

describe('buildModelsField', () => {
  it('sem fallbacks → objeto vazio (usa só model)', () => {
    expect(buildModelsField('openai/gpt-5', undefined)).toEqual({})
    expect(buildModelsField('openai/gpt-5', '')).toEqual({})
  })

  it('com fallbacks → primário na frente + fallbacks', () => {
    expect(buildModelsField('openai/gpt-5', 'openai/gpt-4.1, x/y')).toEqual({
      models: ['openai/gpt-5', 'openai/gpt-4.1', 'x/y'],
    })
  })
})

describe('logAiUsage', () => {
  const info = vi.fn()
  const fakeFastify = { log: { info } } as unknown as FastifyInstance

  it('não lança sem usage', () => {
    expect(() =>
      logAiUsage(fakeFastify, { feature: 'chat', model: 'm', userId: 'u' }),
    ).not.toThrow()
  })

  it('não lança se o logger explodir', () => {
    const brokenFastify = {
      log: {
        info: () => {
          throw new Error('logger down')
        },
      },
    } as unknown as FastifyInstance
    expect(() =>
      logAiUsage(brokenFastify, { feature: 'vision', model: 'm', userId: 'u' }),
    ).not.toThrow()
  })

  it('emite os campos de tokens quando presentes', () => {
    logAiUsage(fakeFastify, {
      feature: 'diet_day',
      model: 'openai/gpt-5',
      userId: 'u1',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    })
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_usage: expect.objectContaining({
          feature: 'diet_day',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        }),
      }),
      'ai_usage',
    )
  })
})

describe('logAiUsage — persistência (M3)', () => {
  it('grava a linha em ai_usage', async () => {
    const db = vi.fn().mockResolvedValue([])
    const fastify = { log: { info: vi.fn(), warn: vi.fn() }, db } as unknown as FastifyInstance

    logAiUsage(fastify, {
      feature: 'diet_day',
      model: 'openai/gpt-5',
      userId: 'u1',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    // A gravação é disparada sem await (não bloqueia a request);
    // esperamos um tick para a promise resolver.
    await new Promise((r) => setImmediate(r))
    expect(db).toHaveBeenCalled()
  })

  it('erro de banco NÃO propaga (best-effort) e não derruba a request', async () => {
    const db = vi.fn().mockRejectedValue(new Error('tabela ausente'))
    const warn = vi.fn()
    const fastify = { log: { info: vi.fn(), warn }, db } as unknown as FastifyInstance

    expect(() => logAiUsage(fastify, { feature: 'chat', model: 'm', userId: 'u1' })).not.toThrow()

    await new Promise((r) => setImmediate(r))
    expect(warn).toHaveBeenCalled()
  })

  it('db rejeita E log.warn lança — nenhuma rejeição escapa (unhandled rejection)', async () => {
    // Dupla falha: o banco rejeita E o log.warn lança (ex.: erro patológico
    // que quebra a serialização do pino). Mesmo assim, não há unhandled rejection.
    const db = vi.fn().mockRejectedValue(new Error('conexão perdida'))
    const warn = vi.fn().mockImplementation(() => {
      throw new Error('log.warn explodiu (serialização?)')
    })
    const fastify = { log: { info: vi.fn(), warn }, db } as unknown as FastifyInstance

    // A chamada é síncrona e não lança.
    expect(() =>
      logAiUsage(fastify, { feature: 'diet_day', model: 'm', userId: 'u' }),
    ).not.toThrow()

    // Aguardamos um tick para a promise do .catch() resolver/rejeitar.
    // Sem o try/catch interno do .catch(), este await falharia com
    // unhandled rejection. Com ele, nada escapa.
    await new Promise((r) => setImmediate(r))

    // O warn foi chamado (mesmo que tenha lançado).
    expect(warn).toHaveBeenCalled()
  })
})
