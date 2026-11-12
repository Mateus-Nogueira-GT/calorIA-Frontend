import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import type { AsaasClient } from './asaas.client.js'
import {
  checkoutPurchase,
  createPackageBodySchema,
  getPurchase,
  tomorrowSaoPaulo,
  updatePackage,
} from './credit-purchases.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const LOCAL = '55555555-5555-5555-5555-555555555555'
const PKG = {
  id: '66666666-6666-6666-6666-666666666666',
  code: 'p10',
  name: '10 créditos',
  credits: 10,
  price_cents: 6000,
}

function fakeAsaas() {
  const calls: string[] = []
  const client = {
    createCustomer: async (i: { cpfCnpj: string }) => {
      calls.push(`customer:${i.cpfCnpj}`)
      return { id: 'cus_1' }
    },
    createPayment: async (i: { value: number; dueDate: string; externalReference: string }) => {
      calls.push(`payment:${i.value}:${i.dueDate}:${i.externalReference}`)
      return { id: 'pay_9', status: 'PENDING', invoiceUrl: 'https://asaas/i/9' }
    },
  } as unknown as AsaasClient
  return { client, calls }
}

describe('pacotes', () => {
  it('preço mínimo de R$ 5,00 (mínimo do Asaas) e código válido', () => {
    const base = { code: 'p10', name: '10 créditos', credits: 10, price_cents: 6000 }
    expect(createPackageBodySchema.safeParse(base).success).toBe(true)
    expect(createPackageBodySchema.safeParse({ ...base, price_cents: 499 }).success).toBe(false)
    expect(createPackageBodySchema.safeParse({ ...base, credits: 0 }).success).toBe(false)
    expect(createPackageBodySchema.safeParse({ ...base, code: 'P 10' }).success).toBe(false)
  })

  it('edição de pacote inexistente → 404', async () => {
    const { fastify } = fakeFastify([['UPDATE credit_packages', []]])
    await expect(updatePackage(fastify, PKG.id, { price_cents: 5000 })).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('compra de créditos', () => {
  it('vencimento é amanhã em São Paulo', () => {
    expect(tomorrowSaoPaulo(new Date('2026-11-13T01:30:00Z'))).toBe('2026-11-13')
  })

  it('primeira compra sem CPF → 422 sem chamar o Asaas', async () => {
    const asaas = fakeAsaas()
    const { fastify } = fakeFastify([['FROM credit_packages', [PKG]]])
    await expect(
      checkoutPurchase(fastify, asaas.client, USER, { package_code: 'p10' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'DOCUMENT_REQUIRED' })
    expect(asaas.calls).toEqual([])
  })

  it('primeira compra: cria cliente e cobrança de R$ 60 com vencimento amanhã', async () => {
    const asaas = fakeAsaas()
    const { fastify, calls } = fakeFastify([
      ['FROM credit_packages', [PKG]],
      [
        'SELECT asaas_customer_id',
        () =>
          calls.some((c) => c.sql.includes('INSERT INTO payment_customers'))
            ? [{ asaas_customer_id: 'cus_1' }]
            : [],
      ],
      ['INSERT INTO credit_purchases', [{ id: LOCAL }]],
    ])
    const r = await checkoutPurchase(
      fastify,
      asaas.client,
      USER,
      { package_code: 'p10', cpf_cnpj: '529.982.247-25', name: 'Ana' },
      new Date('2026-11-12T15:00:00Z'),
    )
    expect(r).toEqual({ purchase_id: LOCAL, status: 'pending', invoice_url: 'https://asaas/i/9' })
    expect(asaas.calls).toEqual(['customer:52998224725', `payment:60:2026-11-13:${LOCAL}`])
    expect(JSON.stringify(calls.map((c) => c.params))).not.toContain('52998224725')
  })

  it('compra seguinte reaproveita o cliente; pendente do mesmo pacote devolve a mesma fatura', async () => {
    const asaas = fakeAsaas()
    const seguinte = fakeFastify([
      ['FROM credit_packages', [PKG]],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO credit_purchases', [{ id: LOCAL }]],
    ])
    await checkoutPurchase(seguinte.fastify, asaas.client, USER, { package_code: 'p10' })
    expect(asaas.calls.some((c) => c.startsWith('customer:'))).toBe(false)

    const pendente = fakeFastify([
      ['FROM credit_packages', [PKG]],
      ["status = 'pending'", [{ id: LOCAL, invoice_url: 'https://asaas/i/antiga' }]],
    ])
    const outra = fakeAsaas()
    const r = await checkoutPurchase(pendente.fastify, outra.client, USER, { package_code: 'p10' })
    expect(r.invoice_url).toBe('https://asaas/i/antiga')
    expect(outra.calls).toEqual([])
  })

  it('toque duplo → 409; falha no Asaas apaga a linha local', async () => {
    const dup = Object.assign(new Error('dup'), { code: '23505' })
    const corrida = fakeFastify([
      ['FROM credit_packages', [PKG]],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO credit_purchases', dup],
    ])
    await expect(
      checkoutPurchase(corrida.fastify, fakeAsaas().client, USER, { package_code: 'p10' }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_IN_PROGRESS' })

    const falha = {
      createPayment: async () => {
        throw new Error('asaas fora')
      },
    } as unknown as AsaasClient
    const { fastify, calls } = fakeFastify([
      ['FROM credit_packages', [PKG]],
      ['SELECT asaas_customer_id', [{ asaas_customer_id: 'cus_1' }]],
      ['INSERT INTO credit_purchases', [{ id: LOCAL }]],
    ])
    await expect(checkoutPurchase(fastify, falha, USER, { package_code: 'p10' })).rejects.toThrow(
      'asaas fora',
    )
    expect(calls.some((c) => c.sql.includes('DELETE FROM credit_purchases'))).toBe(true)
  })

  it('status: só a compra do próprio usuário; paga não devolve fatura', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM credit_purchases WHERE id', [{ id: LOCAL, status: 'paid', invoice_url: 'https://x' }]],
    ])
    const r = await getPurchase(fastify, USER, LOCAL)
    expect(r.invoice_url).toBeNull()
    expect(calls[0].params).toEqual([LOCAL, USER])
    const vazio = fakeFastify([])
    await expect(getPurchase(vazio.fastify, USER, LOCAL)).rejects.toMatchObject({ statusCode: 404 })
  })
})
