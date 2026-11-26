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
  externalReference?: string | null
  deleted?: boolean
}

export interface AsaasSubscription {
  id: string
  status?: string
  externalReference?: string | null
  deleted?: boolean
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
  /** Cobrança não deletada com esse externalReference (id local), ou null. */
  findPaymentByExternalReference(externalReference: string): Promise<AsaasPayment | null>
  /** Assinatura não deletada com esse externalReference (id local), ou null. */
  findSubscriptionByExternalReference(externalReference: string): Promise<AsaasSubscription | null>
  getSubscription(subscriptionId: string): Promise<AsaasSubscription>
}

interface Logger {
  error: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

export function asaasBaseUrl(env: AsaasEnv): string {
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'
}

/**
 * Erro do Asaas: sempre 502 para o usuário. `ambiguous` diz se o Asaas pode ter
 * executado o pedido mesmo assim (timeout, rede, 5xx) ou se o recusou com
 * certeza (4xx, ou pedido nem enviado). Só o definitivo autoriza desfazer a
 * linha local.
 */
export class AsaasError extends AppError {
  constructor(
    public readonly ambiguous: boolean,
    public readonly httpStatus?: number,
  ) {
    super(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'Não foi possível falar com o sistema de pagamento. Tente novamente.',
    )
    this.name = 'AsaasError'
  }
}

export const asaasError = (ambiguous: boolean, httpStatus?: number) =>
  new AsaasError(ambiguous, httpStatus)

/** Só o erro marcado como definitivo conta: qualquer outro pode ter criado a cobrança. */
export function isDefinitiveProviderError(err: unknown): boolean {
  return err instanceof AsaasError && !err.ambiguous
}

// Ids do Asaas (cus_..., sub_..., pay_...) só têm letras, dígitos e _ — nunca montar URL com outra coisa.
function assertId(id: string) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(id)) throw asaasError(false)
}

// externalReference do CalorIA é sempre o uuid da linha local.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function assertReference(ref: string) {
  if (!UUID.test(ref)) throw asaasError(false)
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
      throw asaasError(true)
    } finally {
      clearTimeout(timer)
    }
    let text: string
    try {
      text = await res.text()
    } catch (err) {
      opts.log.error({ err, method, path, status: res.status }, 'asaas_response_unreadable')
      throw asaasError(true, res.status)
    }
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
      throw asaasError(res.status >= 500 || res.status < 400, res.status)
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
    async findPaymentByExternalReference(ref) {
      assertReference(ref)
      const r = await call<{ data?: AsaasPayment[] }>(
        'GET',
        `/payments?externalReference=${encodeURIComponent(ref)}`,
      )
      return (r?.data ?? []).find((p) => !p.deleted && p.externalReference === ref) ?? null
    },
    async findSubscriptionByExternalReference(ref) {
      assertReference(ref)
      const r = await call<{ data?: AsaasSubscription[] }>(
        'GET',
        `/subscriptions?externalReference=${encodeURIComponent(ref)}`,
      )
      return (r?.data ?? []).find((s) => !s.deleted && s.externalReference === ref) ?? null
    },
    async getSubscription(id) {
      assertId(id)
      return call<AsaasSubscription>('GET', `/subscriptions/${id}`)
    },
  }
}
