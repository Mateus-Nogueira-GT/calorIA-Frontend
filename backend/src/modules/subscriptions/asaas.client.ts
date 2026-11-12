import { AppError } from '../../shared/errors.js'

/**
 * Cliente mínimo da API v3 do Asaas (só o que a assinatura usa).
 * Docs: https://docs.asaas.com/reference — autenticação pelo header `access_token`.
 */

export type AsaasEnv = 'sandbox' | 'production'
export type AsaasCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'

export interface AsaasPayment {
  id: string
  status: string
  value?: number
  dueDate?: string
  invoiceUrl?: string
  subscription?: string
}

export interface AsaasClient {
  createCustomer(input: {
    name: string
    cpfCnpj: string
    externalReference: string
  }): Promise<{ id: string }>
  createSubscription(input: {
    customer: string
    billingType: 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD'
    value: number
    nextDueDate: string
    cycle: AsaasCycle
    description: string
    externalReference: string
    callback?: { successUrl: string; autoRedirect?: boolean }
  }): Promise<{ id: string; status?: string }>
  /** Cobrança avulsa (recarga de créditos). */
  createPayment(input: {
    customer: string
    billingType: 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD'
    value: number
    dueDate: string
    description: string
    externalReference: string
    callback?: { successUrl: string; autoRedirect?: boolean }
  }): Promise<AsaasPayment>
  listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]>
  deleteSubscription(subscriptionId: string): Promise<void>
}

interface Logger {
  error: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

export function asaasBaseUrl(env: AsaasEnv): string {
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}

const providerError = () =>
  new AppError(
    502,
    'PAYMENT_PROVIDER_ERROR',
    'Não foi possível falar com o sistema de pagamento. Tente novamente.',
  )

// Ids do Asaas (cus_..., sub_..., pay_...) só têm letras, dígitos e _ — nunca montar URL com outra coisa.
function assertId(id: string) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(id)) throw providerError()
}

export function createAsaasClient(opts: {
  apiKey: string
  env: AsaasEnv
  log: Logger
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): AsaasClient {
  const base = asaasBaseUrl(opts.env)
  const doFetch = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          access_token: opts.apiKey,
          'User-Agent': 'CalorIA/1.0',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      opts.log.error({ err, method, path }, 'asaas_request_failed')
      throw providerError()
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }
    if (!res.ok) {
      // A descrição do Asaas pode citar o CPF: fica no log, não vai para o usuário.
      const errors = (data as { errors?: { code?: string; description?: string }[] } | null)?.errors
      opts.log.error({ status: res.status, method, path, errors }, 'asaas_request_rejected')
      throw providerError()
    }
    return data as T
  }

  return {
    createCustomer: (input) => call('POST', '/customers', input),
    createSubscription: (input) => call('POST', '/subscriptions', input),
    createPayment: (input) => call('POST', '/payments', input),
    async listSubscriptionPayments(id) {
      assertId(id)
      const r = await call<{ data?: AsaasPayment[] }>('GET', `/subscriptions/${id}/payments`)
      return r?.data ?? []
    },
    async deleteSubscription(id) {
      assertId(id)
      await call('DELETE', `/subscriptions/${id}`)
    },
  }
}
