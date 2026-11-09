import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import type { AsaasClient } from './asaas.client.js'
import { isValidCnpj, isValidCpf, normalizeCpfCnpj } from './cpf-cnpj.js'
import {
  cancelMySubscription,
  cancelOnAccountDeletion,
  checkout,
  saoPauloDate,
} from './subscriptions.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const LOCAL = '44444444-4444-4444-4444-444444444444'
const PLAN = {
  id: '33333333-3333-3333-3333-333333333333',
  code: 'pro',
  name: 'Pro',
  price_cents: 2990,
  cycle: 'MONTHLY',
  credits_per_cycle: 100,
  unlimited: false,
}
const BODY = { plan_code: 'pro', cpf_cnpj: '529.982.247-25', name: 'Ana Souza' }

function fakeAsaas(over: Partial<AsaasClient> = {}) {
  const calls: string[] = []
  const client: AsaasClient = {
    createCustomer: async (i) => {
      calls.push(`customer:${i.cpfCnpj}`)
      return { id: 'cus_1' }
    },
    createSubscription: async (i) => {
      calls.push(`subscription:${i.value}:${i.cycle}:${i.billingType}:${i.externalReference}`)
      return { id: 'sub_1' }
    },
    listSubscriptionPayments: async () => {
      calls.push('payments')
      return [
        {
          id: 'pay_1',
          status: 'PENDING',
          dueDate: '2026-11-09',
          invoiceUrl: 'https://asaas/i/1',
          value: 29.9,
        },
      ]
    },
    deleteSubscription: async (id) => {
      calls.push(`delete:${id}`)
    },
    ...over,
  }
  return { client, calls }
}

describe('CPF/CNPJ', () => {
  it('confere os dígitos verificadores', () => {
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('52998224724')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11222333000180')).toBe(false)
    expect(normalizeCpfCnpj('11.222.333/0001-81')).toBe('11222333000181')
    expect(() => normalizeCpfCnpj('123')).toThrow('Confira o CPF')
  })

  it('data do vencimento é a de São Paulo', () => {
    // 01:30 UTC de 10/11 ainda é 09/11 em São Paulo.
    expect(saoPauloDate(new Date('2026-11-10T01:30:00Z'))).toBe('2026-11-09')
  })
})

describe('checkout', () => {
  it('primeira assinatura: cria cliente, linha local antes do Asaas e devolve a fatura', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      [
        'SELECT asaas_customer_id',
        () =>
          calls.some((c) => c.sql.includes('INSERT INTO payment_customers'))
            ? [{ asaas_customer_id: 'cus_1' }]
            : [],
      ],
      ['INSERT INTO subscriptions', [{ id: LOCAL }]],
    ])
    const asaas = fakeAsaas()
    const r = await checkout(fastify, asaas.client, USER, BODY, new Date('2026-11-09T12:00:00Z'))
    expect(r).toEqual({
      subscription_id: LOCAL,
      status: 'pending',
      invoice_url: 'https://asaas/i/1',
    })
    expect(asaas.calls).toEqual([
      'customer:52998224725',
      `subscription:29.9:MONTHLY:UNDEFINED:${LOCAL}`,
      'payments',
    ])
    const order = calls.map((c) => c.sql)
    expect(order.findIndex((s) => s.includes('INSERT INTO subscriptions'))).toBeLessThan(
      order.findIndex((s) => s.includes('SET asaas_subscription_id')),
    )
    // O CPF não é gravado em nenhuma tabela.
    expect(JSON.stringify(calls.map((c) => c.params))).not.toContain('52998224725')
  })

  it('CPF inválido ou plano inexistente: nada é chamado no Asaas', async () => {
    const asaas = fakeAsaas()
    const { fastify } = fakeFastify([])
    await expect(
      checkout(fastify, asaas.client, USER, { ...BODY, cpf_cnpj: '111.111.111-11' }),
    ).rejects.toMatchObject({ statusCode: 422 })
    await expect(checkout(fastify, asaas.client, USER, BODY)).rejects.toMatchObject({
      statusCode: 404,
      code: 'PLAN_NOT_FOUND',
    })
    expect(asaas.calls).toEqual([])
  })

  it('já paga → 409; pendente do mesmo plano → mesma fatura, sem cobrança nova', async () => {
    const asaas = fakeAsaas()
    const pago = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      [
        'FROM subscriptions',
        [
          {
            id: LOCAL,
            plan_id: PLAN.id,
            status: 'active',
            asaas_subscription_id: 'sub_1',
            entitled: true,
          },
        ],
      ],
    ])
    await expect(checkout(pago.fastify, asaas.client, USER, BODY)).rejects.toMatchObject({
      code: 'ALREADY_SUBSCRIBED',
    })
    const pendente = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      [
        'FROM subscriptions',
        [
          {
            id: LOCAL,
            plan_id: PLAN.id,
            status: 'pending',
            asaas_subscription_id: 'sub_1',
            entitled: false,
          },
        ],
      ],
    ])
    const r = await checkout(pendente.fastify, asaas.client, USER, BODY)
    expect(r.invoice_url).toBe('https://asaas/i/1')
    expect(asaas.calls).toEqual(['payments'])
  })

  it('pendente de outro plano é cancelada antes da nova', async () => {
    const asaas = fakeAsaas()
    const { fastify } = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      [
        'FROM subscriptions',
        [
          {
            id: 'old',
            plan_id: 'outro',
            status: 'pending',
            asaas_subscription_id: 'sub_old',
            entitled: false,
          },
        ],
      ],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO subscriptions', [{ id: LOCAL }]],
    ])
    await checkout(fastify, asaas.client, USER, BODY)
    expect(asaas.calls[0]).toBe('delete:sub_old')
    expect(asaas.calls.some((c) => c.startsWith('customer:'))).toBe(false)
  })

  it('checkout simultâneo → 409; falha no Asaas apaga a linha local', async () => {
    const dup = Object.assign(new Error('dup'), { code: '23505' })
    const asaas = fakeAsaas()
    const corrida = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO subscriptions', dup],
    ])
    await expect(checkout(corrida.fastify, asaas.client, USER, BODY)).rejects.toMatchObject({
      code: 'CHECKOUT_IN_PROGRESS',
    })

    const falha = fakeAsaas({
      createSubscription: async () => {
        throw new Error('asaas fora')
      },
    })
    const { fastify, calls } = fakeFastify([
      ['FROM subscription_plans WHERE code', [PLAN]],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO subscriptions', [{ id: LOCAL }]],
    ])
    await expect(checkout(fastify, falha.client, USER, BODY)).rejects.toThrow('asaas fora')
    expect(calls.some((c) => c.sql.includes('DELETE FROM subscriptions'))).toBe(true)
  })
})

describe('cancelamento', () => {
  it('cancela no Asaas e mantém o benefício pago', async () => {
    const asaas = fakeAsaas()
    const { fastify, calls } = fakeFastify([
      [
        "AND status IN ('pending'",
        [
          {
            id: LOCAL,
            plan_id: PLAN.id,
            status: 'active',
            asaas_subscription_id: 'sub_1',
            entitled: true,
          },
        ],
      ],
      [
        'JOIN subscription_plans',
        [
          {
            id: LOCAL,
            status: 'canceled',
            code: 'pro',
            name: 'Pro',
            cancel_at_period_end: true,
            entitled: true,
            invoice_url: 'x',
          },
        ],
      ],
    ])
    const r = await cancelMySubscription(fastify, asaas.client, USER)
    expect(asaas.calls).toEqual(['delete:sub_1'])
    expect(calls.find((c) => c.sql.includes("SET status = 'canceled'"))?.sql).toContain(
      'cancel_at_period_end = (paid_until IS NOT NULL AND paid_until > now())',
    )
    expect(r.subscription).toMatchObject({ status: 'canceled', entitled: true, invoice_url: null })
  })

  it('sem assinatura → 404; exclusão de conta nunca lança', async () => {
    const { fastify } = fakeFastify([])
    await expect(cancelMySubscription(fastify, fakeAsaas().client, USER)).rejects.toMatchObject({
      statusCode: 404,
    })
    const quebrado = fakeFastify([['FROM subscriptions', new Error('db fora')]])
    await expect(
      cancelOnAccountDeletion(quebrado.fastify, fakeAsaas().client, USER),
    ).resolves.toBeUndefined()
    expect(quebrado.logs.some((l) => l.msg === 'subscription_cancel_on_delete_failed')).toBe(true)
  })
})
