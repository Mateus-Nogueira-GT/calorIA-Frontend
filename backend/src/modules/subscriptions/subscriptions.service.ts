import type { FastifyInstance } from 'fastify'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { AsaasClient } from './asaas.client.js'
import { normalizeCpfCnpj } from './cpf-cnpj.js'
import type { CheckoutBody, Cycle, MySubscription } from './subscriptions.schemas.js'

interface PlanRow {
  id: string
  code: string
  name: string
  price_cents: number
  cycle: Cycle
  credits_per_cycle: number | null
  unlimited: boolean
}

interface OpenSubscription {
  id: string
  plan_id: string
  status: 'pending' | 'active' | 'past_due'
  asaas_subscription_id: string | null
  entitled: boolean
}

/** Data de hoje em São Paulo (YYYY-MM-DD), para o vencimento da primeira cobrança. */
export function saoPauloDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

async function openSubscription(
  f: FastifyInstance,
  userId: string,
): Promise<OpenSubscription | undefined> {
  const [row] = await f.db<OpenSubscription[]>`
    SELECT id, plan_id, status, asaas_subscription_id,
      (paid_until IS NOT NULL AND paid_until > now()) AS entitled
    FROM subscriptions
    WHERE user_id = ${userId} AND status IN ('pending','active','past_due')`
  return row
}

/**
 * Grava as cobranças em aberto da assinatura (com o link da fatura) e devolve
 * o link da mais antiga. Best-effort: sem o link, o usuário ainda recebe a
 * fatura por e-mail do Asaas e o webhook PAYMENT_CREATED preenche depois.
 */
async function syncPendingInvoices(
  f: FastifyInstance,
  asaas: AsaasClient,
  subscriptionId: string,
  asaasSubscriptionId: string,
): Promise<string | null> {
  try {
    const payments = await asaas.listSubscriptionPayments(asaasSubscriptionId)
    const open = payments
      .filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE')
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    for (const p of open)
      await f.db`
        INSERT INTO subscription_payments(asaas_payment_id, subscription_id, status, value_cents, due_date, invoice_url)
        VALUES(${p.id}, ${subscriptionId}, ${p.status},
          ${p.value == null ? null : Math.round(p.value * 100)}, ${p.dueDate ?? null}, ${p.invoiceUrl ?? null})
        ON CONFLICT (asaas_payment_id) DO UPDATE SET invoice_url = EXCLUDED.invoice_url, updated_at = now()`
    return open[0]?.invoiceUrl ?? null
  } catch (err) {
    f.log.warn({ err, subscriptionId }, 'subscription_invoice_sync_failed')
    return null
  }
}

/** Cancela no Asaas (cobranças futuras param) e localmente; o benefício pago continua. */
async function cancelSubscriptionRow(
  f: FastifyInstance,
  asaas: AsaasClient,
  sub: Pick<OpenSubscription, 'id' | 'asaas_subscription_id'>,
): Promise<void> {
  if (sub.asaas_subscription_id) await asaas.deleteSubscription(sub.asaas_subscription_id)
  await f.db`
    UPDATE subscriptions SET status = 'canceled',
      cancel_at_period_end = (paid_until IS NOT NULL AND paid_until > now()),
      canceled_at = now(), updated_at = now()
    WHERE id = ${sub.id}`
}

export async function checkout(
  f: FastifyInstance,
  asaas: AsaasClient,
  userId: string,
  body: CheckoutBody,
  now: Date = new Date(),
): Promise<{ subscription_id: string; status: 'pending'; invoice_url: string | null }> {
  const document = normalizeCpfCnpj(body.cpf_cnpj)
  const [plan] = await f.db<PlanRow[]>`
    SELECT id, code, name, price_cents, cycle, credits_per_cycle, unlimited
    FROM subscription_plans WHERE code = ${body.plan_code} AND active`
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado.')

  const open = await openSubscription(f, userId)
  if (open) {
    if (open.status !== 'pending' || open.entitled)
      throw new AppError(409, 'ALREADY_SUBSCRIBED', 'Você já tem uma assinatura ativa.')
    if (open.plan_id === plan.id && open.asaas_subscription_id) {
      // Mesmo plano em aberto: devolve a mesma fatura, sem cobrança nova.
      const invoice = await syncPendingInvoices(f, asaas, open.id, open.asaas_subscription_id)
      return { subscription_id: open.id, status: 'pending', invoice_url: invoice }
    }
    await cancelSubscriptionRow(f, asaas, open)
  }

  let [customer] = await f.db<{ asaas_customer_id: string }[]>`
    SELECT asaas_customer_id FROM payment_customers WHERE user_id = ${userId}`
  if (!customer) {
    const created = await asaas.createCustomer({
      name: body.name,
      cpfCnpj: document,
      externalReference: userId,
    })
    await f.db`
      INSERT INTO payment_customers(user_id, asaas_customer_id) VALUES(${userId}, ${created.id})
      ON CONFLICT (user_id) DO NOTHING`
    ;[customer] = await f.db<{ asaas_customer_id: string }[]>`
      SELECT asaas_customer_id FROM payment_customers WHERE user_id = ${userId}`
  }

  // A linha local vem antes do Asaas: o índice único barra o checkout duplo.
  let local: { id: string }
  try {
    ;[local] = await f.db<{ id: string }[]>`
      INSERT INTO subscriptions(user_id, plan_id, status, price_cents, cycle, credits_per_cycle, unlimited)
      VALUES(${userId}, ${plan.id}, 'pending', ${plan.price_cents}, ${plan.cycle},
        ${plan.credits_per_cycle}, ${plan.unlimited})
      RETURNING id`
  } catch (err) {
    if (pgCode(err) === '23505')
      throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'Já existe uma assinatura sendo criada.')
    throw err
  }

  let remote: { id: string }
  try {
    remote = await asaas.createSubscription({
      customer: customer.asaas_customer_id,
      billingType: 'UNDEFINED',
      value: plan.price_cents / 100,
      nextDueDate: saoPauloDate(now),
      cycle: plan.cycle,
      description: `CalorIA — ${plan.name}`,
      externalReference: local.id,
      ...(env.ASAAS_SUCCESS_URL ? { callback: { successUrl: env.ASAAS_SUCCESS_URL } } : {}),
    })
  } catch (err) {
    await f.db`DELETE FROM subscriptions WHERE id = ${local.id} AND asaas_subscription_id IS NULL`
    throw err
  }
  await f.db`
    UPDATE subscriptions SET asaas_subscription_id = ${remote.id}, updated_at = now()
    WHERE id = ${local.id}`
  f.log.info({ subscription_checkout: { id: local.id, plan: plan.code } }, 'subscription_checkout')
  const invoice = await syncPendingInvoices(f, asaas, local.id, remote.id)
  return { subscription_id: local.id, status: 'pending', invoice_url: invoice }
}

interface MyRow {
  id: string
  status: 'pending' | 'active' | 'past_due' | 'canceled'
  code: string
  name: string
  price_cents: number
  cycle: Cycle
  credits_per_cycle: number | null
  unlimited: boolean
  paid_until: Date | null
  entitled: boolean
  cancel_at_period_end: boolean
  invoice_url: string | null
}

export async function getMySubscription(
  f: FastifyInstance,
  userId: string,
): Promise<MySubscription> {
  const [row] = await f.db<MyRow[]>`
    SELECT s.id, s.status, p.code, p.name, s.price_cents, s.cycle, s.credits_per_cycle,
      s.unlimited, s.paid_until, s.cancel_at_period_end,
      (s.paid_until IS NOT NULL AND s.paid_until > now()) AS entitled,
      (SELECT sp.invoice_url FROM subscription_payments sp
        WHERE sp.subscription_id = s.id AND sp.status IN ('PENDING','OVERDUE')
        ORDER BY sp.due_date NULLS LAST LIMIT 1) AS invoice_url
    FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.user_id = ${userId}
    ORDER BY (s.status IN ('pending','active','past_due')) DESC, s.created_at DESC
    LIMIT 1`
  if (!row) return { enabled: true, subscription: null }
  const { code, name, ...rest } = row
  return {
    enabled: true,
    subscription: {
      ...rest,
      plan: { code, name },
      invoice_url: row.status === 'canceled' ? null : row.invoice_url,
    },
  }
}

export async function cancelMySubscription(
  f: FastifyInstance,
  asaas: AsaasClient,
  userId: string,
): Promise<MySubscription> {
  const open = await openSubscription(f, userId)
  if (open) {
    await cancelSubscriptionRow(f, asaas, open)
    f.log.info({ subscription_canceled: { id: open.id, by: 'user' } }, 'subscription_canceled')
    return getMySubscription(f, userId)
  }
  const current = await getMySubscription(f, userId)
  // Repetição do cancelamento: devolve o estado atual.
  if (current.subscription?.status === 'canceled') return current
  throw new AppError(404, 'NO_SUBSCRIPTION', 'Você não tem assinatura ativa.')
}

/** Exclusão de conta: best-effort, nunca impede a exclusão. */
export async function cancelOnAccountDeletion(
  f: FastifyInstance,
  asaas: AsaasClient,
  userId: string,
): Promise<void> {
  try {
    const open = await openSubscription(f, userId)
    if (open) await cancelSubscriptionRow(f, asaas, open)
  } catch (err) {
    f.log.error({ err, userId }, 'subscription_cancel_on_delete_failed')
  }
}
