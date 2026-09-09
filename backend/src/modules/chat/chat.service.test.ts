import { describe, expect, it } from 'vitest'
import {
  assembleSystemPrompt,
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

describe('CHAT_SYSTEM_PROMPT — segurança e escopo (S6)', () => {
  const prompt = buildSystemPrompt('direct')

  it('pergunta sobre gestação/condições de saúde antes da tool', () => {
    expect(prompt).toMatch(/gestante|gestação/i)
    expect(prompt).toContain('health_conditions')
  })

  it('não ensina mais a fórmula de cálculo (o servidor calcula)', () => {
    expect(prompt).not.toContain('Mifflin')
    expect(prompt).not.toContain('TDEE − 500')
    expect(prompt).toMatch(/não calcule nem prometa/i)
  })

  it('tem regra de escopo e de não insistir após recusa', () => {
    expect(prompt).toMatch(/fora de nutrição/i)
    expect(prompt).toMatch(/recusa por segurança/i)
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

describe('assembleSystemPrompt — dieta já existente', () => {
  const base = 'BASE'
  const contexto = 'CONTEXTO'
  const conhecidos = 'CONHECIDOS'

  /**
   * KNOWN_DATA_INSTRUCTION manda chamar collect_diet_data assim que o usuário
   * confirma os dados. Com dieta ativa, isso transformava qualquer "ok" numa
   * geração nova — a dieta era refeita a cada mensagem.
   */
  it('avisa que já existe dieta e restringe a tool a pedido explícito', () => {
    const prompt = assembleSystemPrompt(base, contexto, conhecidos, true)

    expect(prompt).toContain('JÁ TEM uma dieta ativa')
    expect(prompt).toContain('APENAS se o usuário pedir EXPLICITAMENTE')
  })

  it('a instrução vem DEPOIS da de dados conhecidos, para prevalecer', () => {
    const prompt = assembleSystemPrompt(base, contexto, conhecidos, true)

    expect(prompt.indexOf('JÁ TEM uma dieta ativa')).toBeGreaterThan(
      prompt.indexOf('DADOS JÁ CONHECIDOS'),
    )
  })

  it('sem dieta ativa, o prompt segue igual ao de antes', () => {
    const prompt = assembleSystemPrompt(base, contexto, conhecidos, false)

    expect(prompt).not.toContain('JÁ TEM uma dieta ativa')
    expect(prompt).toBe(assembleSystemPrompt(base, contexto, conhecidos))
  })
})
