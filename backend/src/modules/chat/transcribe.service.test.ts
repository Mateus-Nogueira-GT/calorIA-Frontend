import { describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import {
  TRANSCRIBE_FALLBACK_TOKENS,
  TRANSCRIBE_TOKENS_PER_SECOND,
  audioFormatFromMime,
  transcribeAudio,
} from './transcribe.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const AUDIO = 'AAAAGGZ0eXBNNEEg'

type FetchCall = { url: string; init: RequestInit }

/** fetch falso: grava as chamadas e devolve a resposta (ou lança o erro) informada. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: FetchCall[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { fn, calls }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const body = { audio: AUDIO, mimeType: 'audio/m4a' as const }

describe('audioFormatFromMime', () => {
  it('m4a/mp4 → m4a, aac → aac, webm → webm', () => {
    expect(audioFormatFromMime('audio/m4a')).toBe('m4a')
    expect(audioFormatFromMime('audio/mp4')).toBe('m4a')
    expect(audioFormatFromMime('audio/aac')).toBe('aac')
    expect(audioFormatFromMime('audio/webm')).toBe('webm')
  })
})

describe('transcribeAudio', () => {
  it('sucesso: devolve o texto com trim e chama o OpenRouter com o contrato certo', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(200, { text: '  Comi um pão de queijo.  ' }))

    const r = await transcribeAudio(fastify, USER, body, f.fn)

    expect(r).toEqual({ text: 'Comi um pão de queijo.' })
    expect(f.calls).toHaveLength(1)
    const { url, init } = f.calls[0]
    expect(url).toBe(`${env.OPENAI_BASE_URL}/audio/transcriptions`)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${env.OPENAI_API_KEY}`)
    expect(headers['HTTP-Referer']).toBe('https://caloria.app')
    expect(headers['X-Title']).toBe('CalorIA')
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'openai/whisper-1',
      input_audio: { data: AUDIO, format: 'm4a' },
      language: 'pt',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('format derivado do mimeType (webm)', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(200, { text: 'oi' }))
    await transcribeAudio(fastify, USER, { audio: AUDIO, mimeType: 'audio/webm' }, f.fn)
    expect(JSON.parse(String(f.calls[0].init.body)).input_audio.format).toBe('webm')
  })

  it('checa a quota diária ANTES de chamar o provedor', async () => {
    const { fastify } = fakeFastify([['FROM ai_usage', [{ used: env.AI_DAILY_TOKEN_CAP }]]])
    const f = fakeFetch(() => json(200, { text: 'oi' }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 429,
      code: 'AI_QUOTA_EXCEEDED',
    })
    expect(f.calls).toHaveLength(0)
  })

  it('texto vazio → 422 EMPTY_TRANSCRIPTION', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(200, { text: '   ' }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 422,
      code: 'EMPTY_TRANSCRIPTION',
    })
  })

  it('HTTP 5xx → 502 TRANSCRIBE_FAILED', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(500, { error: { message: 'boom' } }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 502,
      code: 'TRANSCRIBE_FAILED',
    })
  })

  it('erro de rede → 502 TRANSCRIBE_FAILED', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 502,
      code: 'TRANSCRIBE_FAILED',
    })
  })

  it('timeout (AbortSignal) → 502 TRANSCRIBE_FAILED', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 502,
      code: 'TRANSCRIBE_FAILED',
    })
  })

  it('resposta 200 sem campo text → 502 TRANSCRIBE_FAILED', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(200, { error: { message: 'x' } }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 502,
      code: 'TRANSCRIBE_FAILED',
    })
  })

  it.each([408, 429])(
    'HTTP %i do provedor (transitório) → 502 TRANSCRIBE_FAILED',
    async (status) => {
      const { fastify } = fakeFastify()
      const f = fakeFetch(() => json(status, { error: { message: 'slow down' } }))
      await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
        statusCode: 502,
        code: 'TRANSCRIBE_FAILED',
      })
    },
  )

  it.each([400, 401, 402, 404])(
    'HTTP %i do provedor → 503 TRANSCRIBE_UNAVAILABLE',
    async (status) => {
      const { fastify } = fakeFastify()
      const f = fakeFetch(() => json(status, { error: { message: 'model not available' } }))
      await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
        statusCode: 503,
        code: 'TRANSCRIBE_UNAVAILABLE',
      })
    },
  )

  it.each([
    'Audio file is too short. Minimum audio length is 0.1 seconds.',
    'Invalid file format. Supported formats: flac, m4a, mp3, mp4, wav, webm',
    'Could not decode the audio data',
  ])('HTTP 400 do provedor falando do áudio ("%s") → 422 INVALID_AUDIO', async (message) => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(400, { error: { message } }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_AUDIO',
      message: 'Não entendi o áudio, tenta de novo',
    })
  })

  it('HTTP 400 do provedor sem relação com o áudio → continua 503 TRANSCRIBE_UNAVAILABLE', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() => json(400, { error: { message: 'Invalid model id' } }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 503,
      code: 'TRANSCRIBE_UNAVAILABLE',
    })
  })

  it('HTTP 402 falando de áudio (sem crédito) → continua 503, só 400 vira 422', async () => {
    const { fastify } = fakeFastify()
    const f = fakeFetch(() =>
      json(402, { error: { message: 'Insufficient credits for audio transcription' } }),
    )
    await expect(transcribeAudio(fastify, USER, body, f.fn)).rejects.toMatchObject({
      statusCode: 503,
      code: 'TRANSCRIBE_UNAVAILABLE',
    })
  })

  it('registra uso feature transcribe com os tokens do usage', async () => {
    const { fastify, calls } = fakeFastify()
    const f = fakeFetch(() =>
      json(200, {
        text: 'oi',
        usage: { seconds: 3, total_tokens: 42, input_tokens: 40, output_tokens: 2, cost: 0.0003 },
      }),
    )
    await transcribeAudio(fastify, USER, body, f.fn)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    expect(insert).toBeDefined()
    expect(insert?.params.slice(0, 6)).toEqual([USER, 'transcribe', 'openai/whisper-1', 40, 2, 42])
  })

  it('usage só com seconds: estima tokens = ceil(seconds × TRANSCRIBE_TOKENS_PER_SECOND)', async () => {
    const { fastify, calls } = fakeFastify()
    const f = fakeFetch(() => json(200, { text: 'oi', usage: { seconds: 10.2, cost: 0.001 } }))
    await transcribeAudio(fastify, USER, body, f.fn)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    const est = Math.ceil(10.2 * TRANSCRIBE_TOKENS_PER_SECOND)
    expect(insert?.params.slice(0, 6)).toEqual([
      USER,
      'transcribe',
      'openai/whisper-1',
      est,
      0,
      est,
    ])
  })

  it('usage com total_tokens 0 e seconds: também estima pelos segundos', async () => {
    const { fastify, calls } = fakeFastify()
    const f = fakeFetch(() =>
      json(200, {
        text: 'oi',
        usage: { seconds: 4, total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      }),
    )
    await transcribeAudio(fastify, USER, body, f.fn)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    const est = 4 * TRANSCRIBE_TOKENS_PER_SECOND
    expect(insert?.params.slice(0, 6)).toEqual([
      USER,
      'transcribe',
      'openai/whisper-1',
      est,
      0,
      est,
    ])
  })

  it('sem usage (nem tokens nem seconds): registra a estimativa fixa de 60 s', async () => {
    const { fastify, calls } = fakeFastify()
    const f = fakeFetch(() => json(200, { text: 'oi' }))
    await transcribeAudio(fastify, USER, body, f.fn)
    const insert = calls.find((c) => c.sql.includes('INSERT INTO ai_usage'))
    expect(TRANSCRIBE_FALLBACK_TOKENS).toBe(60 * TRANSCRIBE_TOKENS_PER_SECOND)
    expect(insert?.params.slice(0, 6)).toEqual([
      USER,
      'transcribe',
      'openai/whisper-1',
      TRANSCRIBE_FALLBACK_TOKENS,
      0,
      TRANSCRIBE_FALLBACK_TOKENS,
    ])
  })

  it('falha ao gravar ai_usage (migration 021 ausente) não derruba a transcrição', async () => {
    const { fastify } = fakeFastify([
      ['INSERT INTO ai_usage', new Error('violates check constraint "ai_usage_feature_check"')],
    ])
    const f = fakeFetch(() => json(200, { text: 'oi' }))
    await expect(transcribeAudio(fastify, USER, body, f.fn)).resolves.toEqual({ text: 'oi' })
  })
})
