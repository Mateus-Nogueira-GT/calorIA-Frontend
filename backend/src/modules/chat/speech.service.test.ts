import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { SPEECH_MAX_CHARS, speechText, synthesizeLastReply } from './speech.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

type FetchCall = { url: string; init: RequestInit }

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { fn, calls }
}

const mp3 = () =>
  new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04]), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  })

const history = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
  fakeFastify([
    ['FROM chat_history', [{ messages, status: 'collecting' }]],
    ['FROM ai_usage', [{ used: 0 }]],
  ])

const original = {
  enabled: env.COACH_SPEECH_ENABLED,
  enforcement: env.CREDITS_ENFORCEMENT_ENABLED,
}
afterEach(() => {
  env.COACH_SPEECH_ENABLED = original.enabled
  env.CREDITS_ENFORCEMENT_ENABLED = original.enforcement
})

describe('speechText', () => {
  it('remove marcação de markdown', () => {
    expect(speechText('**Ótimo!** Coma _mais_ `fibras`.\n# Dica\n- água')).toBe(
      'Ótimo! Coma mais fibras.\nDica\nágua',
    )
  })
  it('corta em até 4.000 caracteres, no fim de frase', () => {
    const sentence = 'Beba água ao longo do dia. '
    const text = speechText(sentence.repeat(400))
    expect(text.length).toBeLessThanOrEqual(SPEECH_MAX_CHARS)
    expect(text.endsWith('.')).toBe(true)
  })
})

describe('synthesizeLastReply', () => {
  it('fala a última resposta do Coach, sem markdown, em mp3', async () => {
    const fake = history([
      { role: 'assistant', content: 'Primeira resposta.' },
      { role: 'user', content: 'pergunta' },
      { role: 'assistant', content: '**Última** resposta.' },
    ])
    const fetch = fakeFetch(mp3)
    const result = await synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)
    expect(result).toEqual({ audio: 'SUQzBA==', mimeType: 'audio/mpeg' })
    expect(fetch.calls[0].url).toBe(`${env.OPENAI_BASE_URL}/audio/speech`)
    const sent = JSON.parse(String(fetch.calls[0].init.body))
    expect(sent).toEqual({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input: 'Última resposta.',
      response_format: 'mp3',
    })
    const historyQuery = fake.calls.find((c) => c.sql.includes('FROM chat_history'))
    expect(historyQuery?.params).toEqual([CONV, USER])
    expect(fake.logs.some((l) => l.msg === 'ai_usage')).toBe(true)
  })

  it('conversa de outra conta ou inexistente: 404 sem chamar o provedor', async () => {
    const fake = fakeFastify([['FROM chat_history', []]])
    const fetch = fakeFetch(mp3)
    await expect(synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(fetch.calls).toHaveLength(0)
  })

  it('conversa sem resposta do Coach: 404 NO_REPLY_TO_SPEAK', async () => {
    const fake = history([{ role: 'user', content: 'oi' }])
    await expect(
      synthesizeLastReply(fake.fastify, USER, CONV, fakeFetch(mp3).fn),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NO_REPLY_TO_SPEAK' })
  })

  it('provedor recusa (400): 503 SPEECH_UNAVAILABLE', async () => {
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    const fetch = fakeFetch(() => new Response('{"error":"bad model"}', { status: 400 }))
    await expect(synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SPEECH_UNAVAILABLE',
    })
  })

  it('provedor falha (500) ou rede: 502 SPEECH_FAILED', async () => {
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    await expect(
      synthesizeLastReply(
        fake.fastify,
        USER,
        CONV,
        fakeFetch(() => new Response('x', { status: 500 })).fn,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'SPEECH_FAILED' })
    await expect(
      synthesizeLastReply(
        fake.fastify,
        USER,
        CONV,
        fakeFetch(() => Promise.reject(new TypeError('network'))).fn,
      ),
    ).rejects.toMatchObject({ statusCode: 502, code: 'SPEECH_FAILED' })
  })

  it('kill switch desligado: 503 sem tocar banco nem provedor', async () => {
    env.COACH_SPEECH_ENABLED = false
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    const fetch = fakeFetch(mp3)
    await expect(synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SPEECH_UNAVAILABLE',
    })
    expect(fetch.calls).toHaveLength(0)
    expect(fake.calls).toHaveLength(0)
  })

  it('com a cobrança ligada, a síntese é gratuita e não é bloqueada', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    await expect(
      synthesizeLastReply(fake.fastify, USER, CONV, fakeFetch(mp3).fn),
    ).resolves.toMatchObject({ mimeType: 'audio/mpeg' })
  })
})
