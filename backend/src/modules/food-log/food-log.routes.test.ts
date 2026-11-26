import fastifyJwt from '@fastify/jwt'
import Fastify, { type FastifyError } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import foodLogRoutes from './food-log.routes.js'
import { __resetMealFiberColumnsCache } from './meal-fiber-columns.js'
import { __resetMealIdempotencyColumnCache } from './meal-idempotency-column.js'

const USER = '11111111-1111-1111-1111-111111111111'
const MEAL = '22222222-2222-2222-2222-222222222222'
const body = { name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, mealType: 'lunch' }

async function buildTestApp() {
  const fake = fakeFastify([
    ["column_name = 'idempotency_key'", [{ present: true }]],
    ['information_schema.columns', [{ n: 2 }]],
    ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-11-26 12:00:00+00' }]],
  ])
  const app = Fastify().withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(fastifyJwt, { secret: 'test-secret' })
  app.decorate('db', fake.fastify.db)
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({ error: error.code, message: error.message })
    return reply
      .status(error.statusCode ?? 500)
      .send({ error: error.code ?? 'ERR', message: error.message })
  })
  await app.register(foodLogRoutes, { prefix: '/food-log' })
  await app.ready()
  const token = app.jwt.sign({ sub: USER })
  return { app, fake, auth: { authorization: `Bearer ${token}` } }
}

beforeEach(() => {
  __resetMealFiberColumnsCache()
  __resetMealIdempotencyColumnCache()
})

describe('POST /food-log — Idempotency-Key (C4)', () => {
  it('repassa o cabeçalho para o insert idempotente', async () => {
    const { app, fake, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/food-log',
      headers: { ...auth, 'idempotency-key': 'card-0123456789abcdef' },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    const insert = fake.calls.find((c) => c.sql.includes('INSERT INTO meals'))
    expect(insert?.sql).toContain('ON CONFLICT')
    expect(insert?.params).toContain('card-0123456789abcdef')
    await app.close()
  })

  it('sem o cabeçalho (cliente antigo) grava como antes', async () => {
    const { app, fake, auth } = await buildTestApp()
    const res = await app.inject({ method: 'POST', url: '/food-log', headers: auth, payload: body })
    expect(res.statusCode).toBe(201)
    expect(fake.calls.some((c) => c.sql.includes('idempotency_key'))).toBe(false)
    await app.close()
  })

  it('cabeçalho malformado → 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const { app, auth } = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/food-log',
      headers: { ...auth, 'idempotency-key': 'x' },
      payload: body,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_IDEMPOTENCY_KEY')
    await app.close()
  })
})
