import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import adminRoutes from '../admin/admin.routes.js'
import asaasWebhookRoutes from './asaas-webhook.routes.js'
import subscriptionsRoutes from './subscriptions.routes.js'

const TOKEN = 'token-de-teste-com-mais-de-32-caracteres'
const original = {
  enabled: env.SUBSCRIPTIONS_ENABLED,
  token: env.ASAAS_WEBHOOK_TOKEN,
  key: env.ASAAS_API_KEY,
}
afterEach(() => {
  env.SUBSCRIPTIONS_ENABLED = original.enabled
  env.ASAAS_WEBHOOK_TOKEN = original.token
  env.ASAAS_API_KEY = original.key
})

async function app(routes: Parameters<typeof fakeFastify>[0] = []) {
  const fake = fakeFastify(routes)
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  // Igual ao handler global do server.ts para AppError.
  f.setErrorHandler((err, _req, reply) =>
    err instanceof AppError
      ? reply.status(err.statusCode).send({ error: err.code, message: err.message })
      : reply.send(err),
  )
  await f.register(jwt, { secret: 'only-test-secret-not-a-real-provider-key' })
  f.decorate('db', fake.fastify.db)
  await f.register(subscriptionsRoutes, { prefix: '/subscriptions' })
  await f.register(asaasWebhookRoutes, { prefix: '/webhooks/asaas' })
  await f.register(adminRoutes, { prefix: '/admin' })
  await f.ready()
  return { f, calls: fake.calls }
}

const event = {
  id: 'evt_1',
  event: 'PAYMENT_CONFIRMED',
  payment: { id: 'pay_1', subscription: 'sub_1' },
}

describe('rotas de assinatura', () => {
  it('flag desligada: tudo 404, sem tocar no banco', async () => {
    env.SUBSCRIPTIONS_ENABLED = false
    const { f, calls } = await app()
    for (const url of ['/subscriptions/plans', '/subscriptions/me'])
      expect((await f.inject(url)).statusCode).toBe(404)
    const w = await f.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      payload: event,
      headers: { 'asaas-access-token': TOKEN },
    })
    expect(w.statusCode).toBe(404)
    expect(calls).toHaveLength(0)
    await f.close()
  })

  it('planos são públicos; status e checkout exigem login', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    const { f } = await app([['FROM subscription_plans WHERE active', [{ code: 'pro' }]]])
    const plans = await f.inject('/subscriptions/plans')
    expect(plans.statusCode).toBe(200)
    expect(plans.json()).toEqual({ plans: [{ code: 'pro' }] })
    expect((await f.inject('/subscriptions/me')).statusCode).toBe(401)
    // Corpo válido: o Fastify valida o corpo antes do login (400 viria primeiro).
    const body = { plan_code: 'pro', cpf_cnpj: '52998224725', name: 'Ana' }
    expect(
      (await f.inject({ method: 'POST', url: '/subscriptions/checkout', payload: body }))
        .statusCode,
    ).toBe(401)
    await f.close()
  })

  it('checkout sem chave do Asaas → 503', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    env.ASAAS_API_KEY = undefined
    const { f } = await app()
    const r = await f.inject({
      method: 'POST',
      url: '/subscriptions/checkout',
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'u1' })}` },
      payload: { plan_code: 'pro', cpf_cnpj: '52998224725', name: 'Ana' },
    })
    expect(r.statusCode).toBe(503)
    expect(r.json().error).toBe('PAYMENTS_UNAVAILABLE')
    await f.close()
  })
})

describe('webhook do Asaas', () => {
  it('sem token configurado → 503; token ausente ou errado → 401, sem tocar no banco', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    env.ASAAS_WEBHOOK_TOKEN = undefined
    const { f, calls } = await app()
    const post = (headers: Record<string, string>) =>
      f.inject({ method: 'POST', url: '/webhooks/asaas', payload: event, headers })
    expect((await post({ 'asaas-access-token': TOKEN })).statusCode).toBe(503)
    env.ASAAS_WEBHOOK_TOKEN = TOKEN
    expect((await post({})).statusCode).toBe(401)
    expect((await post({ 'asaas-access-token': `${TOKEN}x` })).statusCode).toBe(401)
    expect(calls).toHaveLength(0)
    await f.close()
  })

  it('token certo: grava o evento e responde 200; erro de banco → 500 para o Asaas reenviar', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    env.ASAAS_WEBHOOK_TOKEN = TOKEN
    const ok = await app([['INSERT INTO payment_webhook_events', [{ event_id: 'evt_1' }]]])
    const r = await ok.f.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      payload: event,
      headers: { 'asaas-access-token': TOKEN },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ received: true })
    expect(ok.calls[0].sql).toContain('INSERT INTO payment_webhook_events')
    await ok.f.close()

    const broken = await app([['INSERT INTO payment_webhook_events', new Error('db fora')]])
    const e = await broken.f.inject({
      method: 'POST',
      url: '/webhooks/asaas',
      payload: event,
      headers: { 'asaas-access-token': TOKEN },
    })
    expect(e.statusCode).toBe(500)
    await broken.f.close()
  })
})
