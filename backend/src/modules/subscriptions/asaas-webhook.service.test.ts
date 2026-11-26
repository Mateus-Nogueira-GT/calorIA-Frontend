import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { handleAsaasEvent } from './asaas-webhook.service.js'
import { type AsaasClient, asaasError } from './asaas.client.js'

const original = env.CREDIT_PURCHASES_ENABLED
afterEach(() => {
  env.CREDIT_PURCHASES_ENABLED = original
})

describe('webhook do Asaas / cobrança avulsa', () => {
  const event = (id: string) => ({
    id,
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: 'pay_1',
      value: 60,
      externalReference: '44444444-4444-4444-4444-444444444444',
    },
  })

  // R1 (lote 8): quem decide é a existência da tabela, não a flag (a flag só
  // barra o checkout). Sem a 027 a cobrança avulsa é só registrada (P6).
  it.each([false, true])(
    'sem a tabela credit_purchases: só registra, sem consultá-la (recarga ligada: %s)',
    async (enabled) => {
      env.CREDIT_PURCHASES_ENABLED = enabled
      const { fastify, calls } = fakeFastify([
        ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_1' }]],
        ['to_regclass', [{ present: false }]],
      ])
      expect(await handleAsaasEvent(fastify, event('evt_1'))).toBe('ignored')
      expect(calls.some((c) => c.sql.includes('FROM credit_purchases'))).toBe(false)
      // O evento continua registrado (idempotência da fila do Asaas).
      expect(calls.some((c) => c.sql.includes('INSERT INTO payment_webhook_events'))).toBe(true)
    },
  )

  it.each([false, true])(
    'com a tabela: procura a compra mesmo com a recarga desligada (ligada: %s)',
    async (enabled) => {
      env.CREDIT_PURCHASES_ENABLED = enabled
      const { fastify, calls } = fakeFastify([
        ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_2' }]],
        ['to_regclass', [{ present: true }]],
      ])
      await handleAsaasEvent(fastify, event('evt_2'))
      expect(calls.some((c) => c.sql.includes('FROM credit_purchases'))).toBe(true)
    },
  )
})

describe('webhook do Asaas / assinatura órfã (R4)', () => {
  const LOCAL = '44444444-4444-4444-4444-444444444444'
  const ev = {
    id: 'evt_o',
    event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_1', subscription: 'sub_orfa', value: 29.9, dueDate: '2026-11-09' },
  }
  const asaasWith = (getSubscription: (id: string) => Promise<unknown>) =>
    ({ getSubscription }) as unknown as AsaasClient

  it('assinatura desconhecida: busca no Asaas e liga à linha pending sem id do externalReference', async () => {
    const asked: string[] = []
    const { fastify, calls } = fakeFastify([
      ['SELECT 1 AS candidate FROM subscriptions', [{ candidate: 1 }]],
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
    ])
    await handleAsaasEvent(
      fastify,
      ev,
      asaasWith(async (id) => {
        asked.push(id)
        return { id, externalReference: LOCAL }
      }),
    )
    expect(asked).toEqual(['sub_orfa'])
    const bind = calls.find((c) => c.sql.includes('SET asaas_subscription_id'))
    expect(bind?.params).toEqual(['sub_orfa', LOCAL])
    expect(bind?.sql).toContain('asaas_subscription_id IS NULL')
    expect(bind?.sql).toContain("status = 'pending'")
    // A busca no Asaas acontece fora da transação do evento.
    expect(calls.findIndex((c) => c.sql.includes('SET asaas_subscription_id'))).toBeLessThan(
      calls.findIndex((c) => c.sql.includes('INSERT INTO payment_webhook_events')),
    )
  })

  it('assinatura já conhecida: não consulta o Asaas', async () => {
    const asked: string[] = []
    const { fastify } = fakeFastify([
      ['SELECT 1 AS known FROM subscriptions', [{ known: 1 }]],
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
    ])
    await handleAsaasEvent(
      fastify,
      ev,
      asaasWith(async (id) => {
        asked.push(id)
        return { id }
      }),
    )
    expect(asked).toEqual([])
  })

  it('referência que não é uma linha nossa, 404 ou sem cliente: ignora sem gravar nada', async () => {
    for (const asaas of [
      asaasWith(async (id) => ({ id, externalReference: 'pedido-de-outro-sistema' })),
      asaasWith(async () => {
        throw asaasError(false, 404)
      }),
      undefined,
    ]) {
      const { fastify, calls } = fakeFastify([
        ['SELECT 1 AS candidate FROM subscriptions', [{ candidate: 1 }]],
        ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
      ])
      expect(await handleAsaasEvent(fastify, ev, asaas)).toBe('ignored')
      expect(calls.some((c) => c.sql.includes('SET asaas_subscription_id'))).toBe(false)
    }
  })

  it('busca ambígua falhando: lança (o Asaas reenvia) sem registrar o evento', async () => {
    const { fastify, calls } = fakeFastify([
      ['SELECT 1 AS candidate FROM subscriptions', [{ candidate: 1 }]],
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
    ])
    await expect(
      handleAsaasEvent(
        fastify,
        ev,
        asaasWith(async () => {
          throw asaasError(true)
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 502 })
    expect(calls.some((c) => c.sql.includes('INSERT INTO payment_webhook_events'))).toBe(false)
  })

  it('sem nenhuma linha pending sem id: não consulta o Asaas (evento de outro sistema)', async () => {
    const asked: string[] = []
    const { fastify, calls } = fakeFastify([
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
    ])
    const out = await handleAsaasEvent(
      fastify,
      ev,
      asaasWith(async (id) => {
        asked.push(id)
        throw asaasError(true)
      }),
    )
    expect(asked).toEqual([])
    expect(out).toBe('ignored')
    expect(calls.some((c) => c.sql.includes('SET asaas_subscription_id'))).toBe(false)
  })

  it('assinatura deletada no Asaas: não liga à linha local', async () => {
    const { fastify, calls } = fakeFastify([
      ['SELECT 1 AS candidate FROM subscriptions', [{ candidate: 1 }]],
      ['INSERT INTO payment_webhook_events', [{ event_id: 'evt_o' }]],
    ])
    await handleAsaasEvent(
      fastify,
      ev,
      asaasWith(async (id) => ({ id, externalReference: LOCAL, deleted: true })),
    )
    expect(calls.some((c) => c.sql.includes('SET asaas_subscription_id'))).toBe(false)
  })
})
