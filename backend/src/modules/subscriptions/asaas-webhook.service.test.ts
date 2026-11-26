import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { handleAsaasEvent } from './asaas-webhook.service.js'

const original = env.CREDIT_PURCHASES_ENABLED
afterEach(() => {
  env.CREDIT_PURCHASES_ENABLED = original
})

describe('webhook do Asaas / cobrança avulsa', () => {
  it('recarga desligada: cobrança sem assinatura é ignorada sem consultar credit_purchases', async () => {
    env.CREDIT_PURCHASES_ENABLED = false
    const { fastify, calls } = fakeFastify([
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_1' }]],
    ])
    const out = await handleAsaasEvent(fastify, {
      id: 'evt_1',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_1',
        value: 60,
        externalReference: '44444444-4444-4444-4444-444444444444',
      },
    })
    expect(out).toBe('ignored')
    expect(calls.some((c) => c.sql.includes('credit_purchases'))).toBe(false)
    // O evento continua registrado (idempotência da fila do Asaas).
    expect(calls.some((c) => c.sql.includes('INSERT INTO payment_webhook_events'))).toBe(true)
  })

  it('recarga ligada: cobrança sem assinatura procura a compra', async () => {
    env.CREDIT_PURCHASES_ENABLED = true
    const { fastify, calls } = fakeFastify([
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_2' }]],
    ])
    await handleAsaasEvent(fastify, {
      id: 'evt_2',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_1', value: 60 },
    })
    expect(calls.some((c) => c.sql.includes('FROM credit_purchases'))).toBe(true)
  })
})
