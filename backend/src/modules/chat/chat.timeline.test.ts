import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage, toModelMessages } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

// Feedback de 04/11: o coach respondeu a uma pergunta da semana anterior. O
// histórico não tinha datas — para o modelo, tudo era a mesma conversa.
describe('toModelMessages', () => {
  const now = new Date('2026-11-04T23:20:00Z') // 20:20 em -03
  const tz = -180

  it('prefixa data e hora local em quem tem `at` e devolve só role/content', () => {
    const out = toModelMessages(
      [
        { role: 'user', content: 'oi', at: '2026-11-04T23:10:00Z' },
        { role: 'assistant', content: 'olá', at: '2026-11-04T23:10:05Z' },
      ],
      { now, tzOffsetMinutes: tz, lastActivity: new Date('2026-11-04T23:10:05Z') },
    )
    expect(out).toEqual([
      { role: 'user', content: '[04/11 20:10] oi' },
      { role: 'assistant', content: '[04/11 20:10] olá' },
    ])
  })

  it('histórico antigo sem `at` passa como está', () => {
    const out = toModelMessages([{ role: 'user', content: 'pergunta antiga' }], {
      now,
      tzOffsetMinutes: tz,
      lastActivity: null,
    })
    expect(out).toEqual([{ role: 'user', content: 'pergunta antiga' }])
  })

  it('pausa de mais de 6 h: marcador de retomada antes da mensagem nova', () => {
    const out = toModelMessages(
      [
        { role: 'user', content: 'como fica meu treino?' },
        { role: 'assistant', content: 'Sobre o treino...' },
        { role: 'user', content: 'analisa minha refeição', at: '2026-11-04T23:20:00Z' },
      ],
      { now, tzOffsetMinutes: tz, lastActivity: new Date('2026-10-28T15:00:00Z') },
    )
    expect(out).toHaveLength(4)
    expect(out[2].role).toBe('system')
    expect(out[2].content).toBe(
      '[Retomada em 04/11 às 20:20 — as mensagens acima são de conversas anteriores. Responda à mensagem a seguir.]',
    )
    expect(out[3].content).toBe('[04/11 20:20] analisa minha refeição')
  })

  it('pausa curta: sem marcador', () => {
    const out = toModelMessages(
      [
        { role: 'assistant', content: 'oi' },
        { role: 'user', content: 'e agora?', at: '2026-11-04T23:20:00Z' },
      ],
      { now, tzOffsetMinutes: tz, lastActivity: new Date('2026-11-04T20:00:00Z') },
    )
    expect(out.some((m) => m.role === 'system')).toBe(false)
  })
})

describe('sendChatMessage — tempo da conversa', () => {
  it('grava `at` nas mensagens novas e o modelo recebe o marcador de retomada', async () => {
    const old = {
      messages: [{ role: 'user', content: 'pergunta da semana passada' }],
      updated_at: new Date(Date.now() - 7 * 86_400_000),
    }
    const { fastify, openaiCalls, calls } = fakeFastify([['SELECT messages', [old]]], {
      chatCreate: async () => textCompletion('Vamos ver sua refeição.'),
    })
    await sendChatMessage(fastify, USER, {
      message: 'analisa minha refeição',
      conversation_id: CONV,
      tzOffsetMinutes: -180,
    })

    const sent = openaiCalls[0].params.messages as { role: string; content: string }[]
    expect(sent.some((m) => m.role === 'system' && m.content.startsWith('[Retomada em'))).toBe(true)
    expect(sent[0].content).toMatch(/responda sempre à ÚLTIMA mensagem do usuário/i)

    const insert = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    const persisted = JSON.parse(
      String(insert?.params.find((p) => typeof p === 'string' && p.startsWith('['))),
    )
    expect(persisted.at(-2)).toMatchObject({ role: 'user', content: 'analisa minha refeição' })
    expect(typeof persisted.at(-2).at).toBe('string')
    expect(typeof persisted.at(-1).at).toBe('string')
    // O marcador é só para o modelo: não vai para o banco.
    expect(persisted.some((m: { content: string }) => m.content.startsWith('[Retomada'))).toBe(
      false,
    )
  })
})

describe('resposta do coach sem o carimbo de data', () => {
  it('se o modelo copiar "[dd/mm hh:mm]" no começo, o app não vê', async () => {
    const { fastify } = fakeFastify([], {
      chatCreate: async () => textCompletion('[04/11 20:20] Vamos ver sua refeição.'),
    })
    const r = await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })
    expect(r.message.content).toBe('Vamos ver sua refeição.')
  })
})
