import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  mapOpenAIError,
  normalizeHistory,
  windowedHistory,
} from './chat.service.js'

describe('buildSystemPrompt (personality)', () => {
  it('inclui o tom da personalidade escolhida', () => {
    expect(buildSystemPrompt('direct')).toContain('objetivo e direto')
    expect(buildSystemPrompt('scientific')).toContain('evidências')
    expect(buildSystemPrompt('empathetic')).toContain('acolhedor')
  })

  it('usa motivational como default (null/desconhecida)', () => {
    expect(buildSystemPrompt(null)).toContain('encorajador')
    expect(buildSystemPrompt(undefined)).toContain('encorajador')
    expect(buildSystemPrompt('inexistente')).toContain('encorajador')
  })

  it('mantém o prompt base em todas as variantes', () => {
    for (const p of ['motivational', 'direct', 'empathetic', 'scientific']) {
      expect(buildSystemPrompt(p)).toContain('collect_diet_data')
    }
  })
})

describe('mapOpenAIError', () => {
  it('timeout -> 504 AI_TIMEOUT', () => {
    expect(mapOpenAIError({ name: 'APIConnectionTimeoutError' }).statusCode).toBe(504)
    expect(mapOpenAIError({ code: 'ETIMEDOUT' }).code).toBe('AI_TIMEOUT')
  })

  it('auth/quota (401/429) -> 502 AI_UNAVAILABLE', () => {
    expect(mapOpenAIError({ status: 401 }).code).toBe('AI_UNAVAILABLE')
    expect(mapOpenAIError({ status: 429 }).code).toBe('AI_UNAVAILABLE')
  })

  it('demais erros -> 502 AI_ERROR', () => {
    expect(mapOpenAIError(new Error('boom')).code).toBe('AI_ERROR')
    expect(mapOpenAIError({ status: 500 }).statusCode).toBe(502)
  })
})

describe('normalizeHistory (jsonb robusto)', () => {
  const msgs = [
    { role: 'user' as const, content: 'oi' },
    { role: 'assistant' as const, content: 'olá!' },
  ]

  it('aceita array já parseado', () => {
    expect(normalizeHistory(msgs)).toEqual(msgs)
  })

  it('aceita string JSON (pooler devolvendo texto)', () => {
    expect(normalizeHistory(JSON.stringify(msgs))).toEqual(msgs)
  })

  it('retorna [] para valores irrecuperáveis', () => {
    expect(normalizeHistory('{nope')).toEqual([])
    expect(normalizeHistory(null)).toEqual([])
    expect(normalizeHistory(undefined)).toEqual([])
    expect(normalizeHistory({ not: 'array' })).toEqual([])
  })
})

describe('windowedHistory (G6)', () => {
  it('mantém histórico curto intacto', () => {
    const h = [1, 2, 3]
    expect(windowedHistory(h, 30)).toEqual([1, 2, 3])
  })

  it('corta para as últimas N mensagens', () => {
    const h = Array.from({ length: 40 }, (_, i) => i)
    const w = windowedHistory(h, 30)
    expect(w).toHaveLength(30)
    expect(w[0]).toBe(10)
    expect(w[29]).toBe(39)
  })
})
