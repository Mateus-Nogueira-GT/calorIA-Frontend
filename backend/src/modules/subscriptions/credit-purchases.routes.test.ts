import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import asaasWebhookRoutes from './asaas-webhook.routes.js'
import creditPurchasesRoutes from './credit-purchases.routes.js'

const TOKEN = 'token-de-teste-com-mais-de-32-caracteres'
const original = {
  purchases: env.CREDIT_PURCHASES_ENABLED,
  subs: env.SUBSCRIPTIONS_ENABLED,
  token: env.ASAAS_WEBHOOK_TOKEN,
}
afterEach(() => {
  env.CREDIT_PURCHASES_ENABLED = original.purchases
  env.SUBSCRIPTIONS_ENABLED = original.subs
  env.ASAAS_WEBHOOK_TOKEN = original.token
})

async function app(routes: Parameters<typeof fakeFastify>[0] = []) {
  const fake = fakeFastify(routes)
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  f.setErrorHandler((err, _req, reply) =>
    err instanceof AppError
      ? reply.status(err.statusCode).send({ error: err.code, message: err.message })
      : reply.send(err),
  )
  await f.register(jwt, { secret: 'only-test-secret-not-a-real-provider-key' })
  f.decorate('db', fake.fastify.db)
  await f.register(creditPurchasesRoutes, { prefix: '/credit-purchases' })
  await f.register(asaasWebhookRoutes, { prefix: '/webhooks/asaas' })
  await f.ready()
  return { f, calls: fake.calls }
}

describe('rotas da recarga', () => {
  it('flag desligada → 404 sem tocar no banco', async () => {
    env.CREDIT_PURCHASES_ENABLED = false
    const { f, calls } = await app()
    expect((await f.inject('/credit-purchases/packages')).statusCode).toBe(404)
    expect(calls).toHaveLength(0)
    await f.close()
  })

  it('exige login; com login lista os pacotes', async () => {
    env.CREDIT_PURCHASES_ENABLED = true
    const { f } = await app([
      ['FROM credit_packages', [{ code: 'p10', credits: 10, price_cents: 6000 }]],
    ])
    expect((await f.inject('/credit-purchases/packages')).statusCode).toBe(401)
    const r = await f.inject({
      url: '/credit-purchases/packages',
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'u1' })}` },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ packages: [{ code: 'p10', credits: 10, price_cents: 6000 }] })
    await f.close()
  })

  it('webhook responde com só a recarga ligada', async () => {
    env.CREDIT_PURCHASES_ENABLED = true
    env.SUBSCRIPTIONS_ENABLED = false
    env.ASAAS_WEBHOOK_TOKEN = TOKEN
    const { f } = await app([['INSERT INTO payment_webhook_events', [{ event_id: 'evt_1' }]]])
    const r = await f.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      payload: { id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1' } },
      headers: { 'asaas-access-token': TOKEN },
    })
    expect(r.statusCode).toBe(200)
    await f.close()
  })
})
