import fastifyJwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyError } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { describe, expect, it } from 'vitest'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import scannerRoutes, { GUEST_SCANS_PER_HOUR } from './scanner.routes.js'

const USER = '11111111-1111-1111-1111-111111111111'
const IMG = 'data:image/jpeg;base64,AAAA'
const analysis = {
  is_food: true,
  items: [
    {
      weightGrams: 400,
      fiber: 7,
      name: 'Arroz e feijão',
      calories: 500,
      protein: 20,
      carbs: 80,
      fat: 8,
      confidence: 0.9,
    },
  ],
}

/** App mínimo: JWT simétrico, rate limit, db/openai falsos e o error handler do server.ts. */
async function buildTestApp() {
  const fake = fakeFastify([], {
    parse: async () => ({ choices: [{ message: { parsed: analysis } }], usage: null }),
  })
  const app = Fastify().withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(fastifyJwt, { secret: 'test-secret' })
  app.decorate('db', fake.fastify.db)
  app.decorate('openai', fake.fastify.openai)
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({ error: error.code, message: error.message })
    if (error.statusCode === 429)
      return reply.status(429).send({ error: 'TOO_MANY_REQUESTS', message: error.message })
    return reply
      .status(error.statusCode ?? 500)
      .send({ error: error.code ?? 'ERR', message: error.message })
  })
  await app.register(scannerRoutes, { prefix: '/scanner' })
  await app.ready()
  const token = app.jwt.sign({ sub: USER })
  return { app, fake, auth: { authorization: `Bearer ${token}` } }
}

describe('POST /scanner/analyze-guest (App Store 5.1.1(v))', () => {
  it('sem JWT → 200 com a estimativa', async () => {
    const { app } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/scanner/analyze-guest',
      payload: { image: IMG },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items[0].name).toBe('Arroz e feijão')
  })

  it('confere o teto global de convidados, não o de um usuário', async () => {
    const { app, fake } = await buildTestApp()
    await app.inject({ method: 'POST', url: '/scanner/analyze-guest', payload: { image: IMG } })
    const quota = fake.calls.find((c) => c.sql.includes('FROM ai_usage'))
    expect(quota?.sql).toContain('user_id IS NULL')
  })

  it(`acima de ${GUEST_SCANS_PER_HOUR}/hora no mesmo IP → 429`, async () => {
    const { app } = await buildTestApp()
    for (let i = 0; i < GUEST_SCANS_PER_HOUR; i++) {
      const ok = await app.inject({
        method: 'POST',
        url: '/scanner/analyze-guest',
        payload: { image: IMG },
      })
      expect(ok.statusCode).toBe(200)
    }
    const res = await app.inject({
      method: 'POST',
      url: '/scanner/analyze-guest',
      payload: { image: IMG },
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toBe('TOO_MANY_REQUESTS')
  })
})

describe('POST /scanner/analyze', () => {
  it('continua exigindo JWT', async () => {
    const { app } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/scanner/analyze',
      payload: { image: IMG },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('UNAUTHORIZED')
  })

  it('com JWT → 200 e quota por usuário', async () => {
    const { app, fake, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/scanner/analyze',
      headers: auth,
      payload: { image: IMG },
    })
    expect(res.statusCode).toBe(200)
    const quota = fake.calls.find((c) => c.sql.includes('FROM ai_usage'))
    expect(quota?.params).toContain(USER)
  })
})
