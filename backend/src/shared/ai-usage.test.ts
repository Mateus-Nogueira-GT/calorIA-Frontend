import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { buildModelsField, checkDailyQuota, logAiUsage, parseFallbackModels } from './ai-usage.js'
import { fakeFastify } from './testing/fake-fastify.js'

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

describe('logAiUsage — contexto (OP4)', () => {
  it('grava conversation_id, finish_reason e tool_called quando informados', async () => {
    const { fastify, calls } = fakeFastify()
    logAiUsage(fastify, {
      feature: 'chat',
      model: 'm',
      userId: 'u',
      usage: { total_tokens: 10 },
      conversationId: 'conv-1',
      finishReason: 'tool_calls',
      toolCalled: true,
    })
    await new Promise((r) => setTimeout(r, 0))
    const ins = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    expect(ins?.sql).toContain('conversation_id')
    expect(ins?.params).toContain('conv-1')
    expect(ins?.params).toContain('tool_calls')
    expect(ins?.params).toContain(true)
  })
})

describe('checkDailyQuota (OP2)', () => {
  const USER = '11111111-1111-1111-1111-111111111111'

  it('abaixo do teto: resolve', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 10 }]]])
    await expect(checkDailyQuota(fastify, USER, 'coach')).resolves.toBeUndefined()
  })

  it('no teto ou acima: 429 AI_QUOTA_EXCEEDED', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 200_000 }]]])
    await expect(checkDailyQuota(fastify, USER, 'coach')).rejects.toMatchObject({
      statusCode: 429,
      code: 'AI_QUOTA_EXCEEDED',
    })
  })

  it('consulta só as últimas 24h do usuário', async () => {
    const { fastify, calls } = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(fastify, USER, 'coach')
    expect(calls[0].sql).toContain("interval '24 hours'")
    expect(calls[0].params).toContain(USER)
  })

  it('telemetria indisponível: libera com warn (fail-open)', async () => {
    const { fastify, logs } = fakeFastify([['FROM ai_usage', new Error('tabela sumiu')]])
    await expect(checkDailyQuota(fastify, USER, 'coach')).resolves.toBeUndefined()
    expect(logs.some((l) => l.level === 'warn')).toBe(true)
  })
})

describe('checkDailyQuota — convidado (userId null)', () => {
  it('soma só a visão de convidados (user_id IS NULL)', async () => {
    const { fastify, calls } = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(fastify, null, 'vision')
    expect(calls[0].sql).toContain('user_id IS NULL')
    expect(calls[0].sql).toContain("feature = 'vision'")
  })

  it('teto global de convidados atingido: 429 pedindo conta', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 1_000_000 }]]])
    await expect(checkDailyQuota(fastify, null, 'vision')).rejects.toMatchObject({
      statusCode: 429,
      code: 'AI_QUOTA_EXCEEDED',
      message: expect.stringContaining('Crie uma conta'),
    })
  })
})

describe('checkDailyQuota — teto por grupo (feedback 27/10)', () => {
  const USER = '11111111-1111-1111-1111-111111111111'

  it('cada grupo soma só as próprias features', async () => {
    const coach = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(coach.fastify, USER, 'coach')
    expect(coach.calls[0].params).toContainEqual(['chat', 'transcribe', 'speech'])

    const diet = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(diet.fastify, USER, 'diet')
    expect(diet.calls[0].params).toContainEqual(['diet_day'])

    const vision = fakeFastify([['FROM ai_usage', [{ used: 0 }]]])
    await checkDailyQuota(vision.fastify, USER, 'vision')
    expect(vision.calls[0].params).toContainEqual(['vision'])
  })

  it('a geração de dieta tem teto próprio, maior que o do coach', async () => {
    // 250k: estoura o teto do coach (200k), cabe no da dieta.
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: 250_000 }]]])
    await expect(checkDailyQuota(fastify, USER, 'diet')).resolves.toBeUndefined()
    await expect(checkDailyQuota(fastify, USER, 'coach')).rejects.toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
    })
  })

  it('estourado: devolve retryAt (quando a janela de 24 h libera) e diz que não houve cobrança', async () => {
    const { fastify } = fakeFastify([
      ['retry_at', [{ retry_at: new Date('2026-10-28T22:15:00Z') }]],
      ['FROM ai_usage', [{ used: 210_000 }]],
    ])
    await expect(checkDailyQuota(fastify, USER, 'coach')).rejects.toMatchObject({
      statusCode: 429,
      code: 'AI_QUOTA_EXCEEDED',
      message: expect.stringContaining('nenhum crédito foi cobrado'),
      details: { retryAt: '2026-10-28T22:15:00.000Z' },
    })
  })

  it('falha ao calcular retryAt não impede o 429', async () => {
    const { fastify } = fakeFastify([
      ['retry_at', new Error('boom')],
      ['FROM ai_usage', [{ used: 210_000 }]],
    ])
    const err = await checkDailyQuota(fastify, USER, 'coach').catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'AI_QUOTA_EXCEEDED' })
    expect((err as { details?: unknown }).details).toBeUndefined()
  })
})
