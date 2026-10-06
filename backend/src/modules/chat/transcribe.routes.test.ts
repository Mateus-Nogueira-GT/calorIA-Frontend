import fastifyJwt from '@fastify/jwt'
import Fastify, { type FastifyError } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import chatRoutes from './chat.routes.js'
import { TRANSCRIBE_AUDIO_MAX_CHARS, TRANSCRIBE_BODY_LIMIT } from './chat.schemas.js'

const USER = '11111111-1111-1111-1111-111111111111'

/** App mínimo: JWT simétrico, db falso e o mesmo tratamento de erro do server.ts. */
async function buildTestApp() {
  const app = Fastify().withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(fastifyJwt, { secret: 'test-secret' })
  app.decorate('db', fakeFastify().fastify.db)
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({ error: error.code, message: error.message })
    if (error.validation)
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message })
    return reply
      .status(error.statusCode ?? 500)
      .send({ error: error.code ?? 'ERR', message: error.message })
  })
  await app.register(chatRoutes, { prefix: '/chat' })
  await app.ready()
  const token = app.jwt.sign({ sub: USER })
  return { app, auth: { authorization: `Bearer ${token}` } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /chat/transcribe', () => {
  it('sem JWT → 401', async () => {
    const { app } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      payload: { audio: 'AAAA', mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('UNAUTHORIZED')
  })

  it('corpo acima do limite (3,5 MB) → 413', async () => {
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'A'.repeat(4 * 1024 * 1024), mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(413)
  })

  it('aceita corpo acima do 1 MB padrão do Fastify (~1,5 MB)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: 'ok' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'A'.repeat(1_500_000), mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('campo audio acima do teto (cabe no bodyLimit mas passa do .max) → 400', async () => {
    const { app, auth } = await buildTestApp()
    // Tamanho entre TRANSCRIBE_AUDIO_MAX_CHARS e o bodyLimit: prova a validação do campo.
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'A'.repeat(TRANSCRIBE_AUDIO_MAX_CHARS + 4), mimeType: 'audio/m4a' },
    })
    expect(TRANSCRIBE_AUDIO_MAX_CHARS + 100).toBeLessThan(TRANSCRIBE_BODY_LIMIT)
    expect(res.statusCode).toBe(400)
  })

  it('data URI (com prefixo data:) → 400', async () => {
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'data:audio/m4a;base64,AAAA', mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('mimeType fora da lista → 400', async () => {
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'AAAA', mimeType: 'audio/wav' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sucesso → 200 { text }', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: ' Almocei arroz. ' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'AAAA', mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ text: 'Almocei arroz.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('provedor 4xx → 503 TRANSCRIBE_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{}}', { status: 404 })),
    )
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/chat/transcribe',
      headers: auth,
      payload: { audio: 'AAAA', mimeType: 'audio/m4a' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toBe('TRANSCRIBE_UNAVAILABLE')
  })
})
