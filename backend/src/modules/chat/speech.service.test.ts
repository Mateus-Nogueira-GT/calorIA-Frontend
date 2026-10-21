import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { SPEECH_MAX_CHARS, pcmToWav, speechText, synthesizeLastReply } from './speech.service.js'

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

const PCM = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])
const mp3 = (contentType = 'audio/pcm') =>
  new Response(PCM, { status: 200, headers: { 'Content-Type': contentType } })
const wavInfo = (base64: string) => {
  const wav = Buffer.from(base64, 'base64')
  return {
    riff: wav.toString('ascii', 0, 4),
    wave: wav.toString('ascii', 8, 12),
    rate: wav.readUInt32LE(24),
    bits: wav.readUInt16LE(34),
    dataSize: wav.readUInt32LE(40),
    data: [...wav.subarray(44)],
  }
}

const history = (messages: { role: 'user' | 'assistant'; content: string }[]) =>
  fakeFastify([
    ['FROM chat_history', [{ messages, status: 'collecting' }]],
    ['FROM ai_usage', [{ used: 0 }]],
  ])

const original = {
  enabled: env.COACH_SPEECH_ENABLED,
  enforcement: env.CREDITS_ENFORCEMENT_ENABLED,
  format: env.OPENAI_TTS_FORMAT,
}
afterEach(() => {
  env.COACH_SPEECH_ENABLED = original.enabled
  env.CREDITS_ENFORCEMENT_ENABLED = original.enforcement
  env.OPENAI_TTS_FORMAT = original.format
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
  it('fala a última resposta do Coach, sem markdown, pedindo PCM e devolvendo WAV', async () => {
    const fake = history([
      { role: 'assistant', content: 'Primeira resposta.' },
      { role: 'user', content: 'pergunta' },
      { role: 'assistant', content: '**Última** resposta.' },
    ])
    const fetch = fakeFetch(mp3)
    const result = await synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)
    expect(result.mimeType).toBe('audio/wav')
    expect(wavInfo(result.audio)).toEqual({
      riff: 'RIFF',
      wave: 'WAVE',
      rate: 24000,
      bits: 16,
      dataSize: PCM.length,
      data: [...PCM],
    })
    expect(fetch.calls[0].url).toBe(`${env.OPENAI_BASE_URL}/audio/speech`)
    const sent = JSON.parse(String(fetch.calls[0].init.body))
    expect(sent).toEqual({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input: 'Última resposta.',
      response_format: 'pcm',
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
    ).resolves.toMatchObject({ mimeType: 'audio/wav' })
  })

  it('usa a taxa de amostragem informada pelo provedor', async () => {
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    const result = await synthesizeLastReply(
      fake.fastify,
      USER,
      CONV,
      fakeFetch(() => mp3('audio/pcm;rate=16000')).fn,
    )
    expect(wavInfo(result.audio).rate).toBe(16000)
  })

  it('formato mp3 configurado: repassa o MP3 sem converter', async () => {
    env.OPENAI_TTS_FORMAT = 'mp3'
    const fake = history([{ role: 'assistant', content: 'Oi.' }])
    const fetch = fakeFetch(() => mp3('audio/mpeg'))
    const result = await synthesizeLastReply(fake.fastify, USER, CONV, fetch.fn)
    expect(JSON.parse(String(fetch.calls[0].init.body)).response_format).toBe('mp3')
    expect(result).toEqual({ audio: Buffer.from(PCM).toString('base64'), mimeType: 'audio/mpeg' })
  })
})

describe('pcmToWav', () => {
  it('cabeçalho WAV de 44 bytes com PCM 16 bits mono', () => {
    const wav = pcmToWav(Buffer.from([0, 0, 1, 0]), 24000)
    expect(wav.length).toBe(48)
    expect(wav.readUInt32LE(4)).toBe(40)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(28)).toBe(48000)
  })
})
