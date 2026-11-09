import { describe, expect, it } from 'vitest'
import { AppError } from '../../shared/errors.js'
import { asaasBaseUrl, createAsaasClient } from './asaas.client.js'

type Call = { url: string; init: RequestInit }

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = []
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const r = responses.shift() ?? { status: 200, body: {} }
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { calls, impl: impl as typeof fetch }
}

const silentLog = { error: () => {}, warn: () => {} }

describe('cliente Asaas', () => {
  it('base por ambiente', () => {
    expect(asaasBaseUrl('sandbox')).toBe('https://api-sandbox.asaas.com/v3')
    expect(asaasBaseUrl('production')).toBe('https://api.asaas.com/v3')
  })

  it('envia a chave no header access_token, User-Agent e JSON', async () => {
    const f = fakeFetch([{ status: 200, body: { id: 'cus_1' } }])
    const client = createAsaasClient({
      apiKey: 'k',
      env: 'sandbox',
      fetchImpl: f.impl,
      log: silentLog,
    })
    const r = await client.createCustomer({
      name: 'Ana',
      cpfCnpj: '52998224725',
      externalReference: 'u1',
    })
    expect(r).toEqual({ id: 'cus_1' })
    const { url, init } = f.calls[0]
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.access_token).toBe('k')
    expect(headers['User-Agent']).toBe('CalorIA/1.0')
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Ana',
      cpfCnpj: '52998224725',
      externalReference: 'u1',
    })
  })

  it('assinatura, pagamentos e cancelamento usam as rotas certas', async () => {
    const f = fakeFetch([
      { status: 200, body: { id: 'sub_1', status: 'ACTIVE' } },
      {
        status: 200,
        body: { data: [{ id: 'pay_1', invoiceUrl: 'https://x/i/1', status: 'PENDING' }] },
      },
      { status: 200, body: { deleted: true, id: 'sub_1' } },
    ])
    const client = createAsaasClient({
      apiKey: 'k',
      env: 'production',
      fetchImpl: f.impl,
      log: silentLog,
    })
    await client.createSubscription({
      customer: 'cus_1',
      billingType: 'UNDEFINED',
      value: 29.9,
      nextDueDate: '2026-11-09',
      cycle: 'MONTHLY',
      description: 'CalorIA Pro',
      externalReference: 's1',
    })
    const payments = await client.listSubscriptionPayments('sub_1')
    await client.deleteSubscription('sub_1')
    expect(f.calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'POST https://api.asaas.com/v3/subscriptions',
      'GET https://api.asaas.com/v3/subscriptions/sub_1/payments',
      'DELETE https://api.asaas.com/v3/subscriptions/sub_1',
    ])
    expect(payments[0].invoiceUrl).toBe('https://x/i/1')
  })

  it('id com caractere estranho é recusado antes da chamada', async () => {
    const f = fakeFetch([])
    const client = createAsaasClient({
      apiKey: 'k',
      env: 'sandbox',
      fetchImpl: f.impl,
      log: silentLog,
    })
    await expect(client.deleteSubscription('../customers')).rejects.toBeInstanceOf(AppError)
    expect(f.calls).toHaveLength(0)
  })

  it('erro do Asaas vira 502 sem expor a descrição; a descrição vai para o log', async () => {
    const logged: unknown[] = []
    const f = fakeFetch([
      { status: 400, body: { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF inválido' }] } },
    ])
    const client = createAsaasClient({
      apiKey: 'k',
      env: 'sandbox',
      fetchImpl: f.impl,
      log: { error: (o: unknown) => logged.push(o), warn: () => {} },
    })
    const err = await client
      .createCustomer({ name: 'Ana', cpfCnpj: '1', externalReference: 'u1' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.statusCode).toBe(502)
    expect(err.code).toBe('PAYMENT_PROVIDER_ERROR')
    expect(err.message).not.toContain('CPF inválido')
    expect(JSON.stringify(logged)).toContain('invalid_cpfCnpj')
  })

  it('timeout vira 502', async () => {
    const impl = ((_u: string, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    const client = createAsaasClient({
      apiKey: 'k',
      env: 'sandbox',
      fetchImpl: impl,
      timeoutMs: 20,
      log: silentLog,
    })
    await expect(client.listSubscriptionPayments('sub_1')).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
