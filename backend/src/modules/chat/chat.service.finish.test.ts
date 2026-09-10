import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion, toolCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

describe('sendChatMessage — finish_reason (C3)', () => {
  it('length → repete UMA vez com reasoning minimal e max_tokens 4000; persiste a 2ª', async () => {
    const respostas = [textCompletion('', 'length'), textCompletion('Qual seu peso?', 'stop')]
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      chatCreate: async () => respostas.shift(),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })

    expect(openaiCalls).toHaveLength(2)
    expect(openaiCalls[0].params.max_tokens).toBe(2000)
    expect(openaiCalls[1].params.max_tokens).toBe(4000)
    expect(openaiCalls[1].params.reasoning_effort).toBe('minimal')
    expect(r.message.content).toBe('Qual seu peso?')
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(true)
  })

  it('length duas vezes → 502 AI_TRUNCATED e NADA persistido', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Desculpe, não', 'length'),
    })

    await expect(
      sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_TRUNCATED',
    })
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('content_filter → 422 AI_CONTENT_FILTERED, nada persistido', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('', 'content_filter'),
    })

    await expect(
      sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'AI_CONTENT_FILTERED',
    })
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('tool desconhecida → warn, sem job, e AI_TRUNCATED (content vazio) sem persistir', async () => {
    const { fastify, calls, logs } = fakeFastify([], {
      chatCreate: async () => toolCompletion({}, 'delete_everything'),
    })

    await expect(
      sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV }),
    ).rejects.toMatchObject({
      code: 'AI_TRUNCATED',
    })
    expect(logs.some((l) => l.level === 'warn' && l.msg.includes('Tool desconhecida'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
  })

  it('resposta normal (stop) segue igual: 1 chamada, persistida', async () => {
    const { fastify, openaiCalls, calls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Olá!'),
    })
    const r = await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })
    expect(openaiCalls).toHaveLength(1)
    expect(r.message.content).toBe('Olá!')
    expect(calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(true)
  })

  it('falha ao gravar o histórico → 500 HISTORY_WRITE_FAILED (o app oferece reenviar)', async () => {
    const { fastify } = fakeFastify([['INSERT INTO chat_history', new Error('db down')]], {
      chatCreate: async () => textCompletion('Olá!'),
    })

    await expect(
      sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV }),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: 'HISTORY_WRITE_FAILED',
    })
  })
})
