import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type postgres from 'postgres'
import { CREDIT_POLICY } from '../credits/credit-policy.js'
import { ensureWallet } from '../credits/credits.service.js'
import type { Cycle } from './subscriptions.schemas.js'

type Tx = postgres.Sql | postgres.TransactionSql

export interface AsaasEvent {
  id: string
  event: string
  payment?: {
    id: string
    subscription?: string | null
    status?: string
    value?: number
    dueDate?: string
    invoiceUrl?: string
    externalReference?: string | null
  }
  subscription?: { id: string }
}

/** Comparação em tempo constante (hash para igualar tamanhos). */
export function webhookTokenMatches(received: unknown, expected: string): boolean {
  if (typeof received !== 'string' || !received) return false
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

const CYCLE_INTERVAL: Record<Cycle, string> = {
  MONTHLY: '1 month',
  QUARTERLY: '3 months',
  SEMIANNUALLY: '6 months',
  YEARLY: '1 year',
}

const PAID = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const REVERSED = new Set([
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
])
const REVERSED_STATUS = ['REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK_REQUESTED']

interface SubRow {
  id: string
  user_id: string | null
  status: string
  cycle: Cycle
  credits_per_cycle: number | null
  paid_until: Date | null
}

interface PaymentRow {
  status: string
  credited_units: number
  period_end: Date | null
}

export type WebhookOutcome =
  | 'duplicate'
  | 'ignored'
  | 'payment_updated'
  | 'paid'
  | 'overdue'
  | 'reversed'
  | 'subscription_canceled'
  | 'purchase_paid'
  | 'purchase_reversed'
  | 'purchase_closed'

function statusFromEvent(event: string): string {
  return event.replace(/^PAYMENT_/, '')
}

async function upsertPaymentStatus(
  tx: Tx,
  sub: SubRow,
  p: NonNullable<AsaasEvent['payment']>,
  status: string,
) {
  await tx`
    INSERT INTO subscription_payments(asaas_payment_id, subscription_id, status, value_cents, due_date, invoice_url)
    VALUES(${p.id}, ${sub.id}, ${status}, ${p.value == null ? null : Math.round(p.value * 100)},
      ${p.dueDate ?? null}, ${p.invoiceUrl ?? null})
    ON CONFLICT (asaas_payment_id) DO UPDATE SET
      -- Fora de ordem: estorno nunca é desfeito e pagamento confirmado não volta a "em aberto".
      status = CASE
        WHEN subscription_payments.status = ANY(${REVERSED_STATUS}::text[]) THEN subscription_payments.status
        WHEN subscription_payments.status IN ('CONFIRMED','RECEIVED')
          AND EXCLUDED.status IN ('PENDING','OVERDUE') THEN subscription_payments.status
        ELSE EXCLUDED.status END,
      invoice_url = COALESCE(EXCLUDED.invoice_url, subscription_payments.invoice_url),
      due_date = COALESCE(EXCLUDED.due_date, subscription_payments.due_date),
      updated_at = now()`
}

/**
 * Pagamento confirmado: libera o período (vencimento + 1 ciclo + 1 dia, no
 * fuso de São Paulo) e soma os créditos do ciclo uma única vez por pagamento.
 * CONFIRMED seguido de RECEIVED (cartão, boleto) não credita de novo.
 */
async function markPaid(
  tx: Tx,
  sub: SubRow,
  p: NonNullable<AsaasEvent['payment']>,
  status: string,
) {
  const due =
    p.dueDate ??
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const interval = CYCLE_INTERVAL[sub.cycle]
  const [pay] = await tx<PaymentRow[]>`
    INSERT INTO subscription_payments(asaas_payment_id, subscription_id, status, value_cents, due_date, invoice_url, period_end)
    VALUES(${p.id}, ${sub.id}, ${status}, ${p.value == null ? null : Math.round(p.value * 100)}, ${due},
      ${p.invoiceUrl ?? null},
      ((${due}::date + ${interval}::interval + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo'))
    ON CONFLICT (asaas_payment_id) DO UPDATE SET
      status = CASE WHEN subscription_payments.status = ANY(${REVERSED_STATUS}::text[])
        THEN subscription_payments.status ELSE EXCLUDED.status END,
      period_end = COALESCE(subscription_payments.period_end, EXCLUDED.period_end),
      updated_at = now()
    RETURNING status, credited_units, period_end`
  // Estorno chegou antes da confirmação: não libera nada.
  if (REVERSED_STATUS.includes(pay.status)) return
  await tx`
    UPDATE subscriptions SET
      paid_until = GREATEST(COALESCE(paid_until, '-infinity'::timestamptz), ${pay.period_end}),
      status = CASE WHEN status = 'canceled' THEN 'canceled' ELSE 'active' END,
      updated_at = now()
    WHERE id = ${sub.id}`
  if (!sub.credits_per_cycle || !sub.user_id || pay.credited_units > 0) return
  const units = sub.credits_per_cycle * CREDIT_POLICY.units_per_credit
  await ensureWallet(tx, sub.user_id)
  await tx`SELECT user_id FROM credit_wallets WHERE user_id = ${sub.user_id} FOR UPDATE`
  const inserted = await tx`
    INSERT INTO credit_ledger(user_id, kind, units, payment_ref)
    VALUES(${sub.user_id}, 'subscription', ${units}, ${p.id})
    ON CONFLICT (payment_ref, kind) DO NOTHING RETURNING id`
  if (!inserted.length) return
  await tx`UPDATE credit_wallets SET balance_units = balance_units + ${units} WHERE user_id = ${sub.user_id}`
  await tx`UPDATE subscription_payments SET credited_units = ${units} WHERE asaas_payment_id = ${p.id}`
}

/**
 * Estorno/chargeback: retira os créditos daquele pagamento até o saldo
 * disponível (o saldo nunca fica negativo) e, se o pagamento sustentava o
 * período atual, encerra o período agora. Só o primeiro evento de estorno de
 * cada pagamento tem efeito.
 */
async function markReversed(
  tx: Tx,
  sub: SubRow,
  p: NonNullable<AsaasEvent['payment']>,
  status: string,
) {
  const [pay] = await tx<PaymentRow[]>`
    SELECT status, credited_units, period_end FROM subscription_payments
    WHERE asaas_payment_id = ${p.id} FOR UPDATE`
  if (!pay) {
    await upsertPaymentStatus(tx, sub, p, status)
    return
  }
  if (REVERSED_STATUS.includes(pay.status)) return
  await tx`UPDATE subscription_payments SET status = ${status}, updated_at = now() WHERE asaas_payment_id = ${p.id}`
  if (pay.period_end)
    await tx`
      UPDATE subscriptions SET paid_until = now(), updated_at = now()
      WHERE id = ${sub.id} AND paid_until = ${pay.period_end}`
  if (!sub.user_id || pay.credited_units <= 0) return
  const [w] = await tx<{ available: number }[]>`
    SELECT balance_units - reserved_units AS available FROM credit_wallets
    WHERE user_id = ${sub.user_id} FOR UPDATE`
  const take = Math.min(pay.credited_units, Math.max(0, w?.available ?? 0))
  if (take <= 0) return
  const inserted = await tx`
    INSERT INTO credit_ledger(user_id, kind, units, payment_ref)
    VALUES(${sub.user_id}, 'subscription_reversal', ${-take}, ${p.id})
    ON CONFLICT (payment_ref, kind) DO NOTHING RETURNING id`
  if (!inserted.length) return
  await tx`UPDATE credit_wallets SET balance_units = balance_units - ${take} WHERE user_id = ${sub.user_id}`
  await tx`UPDATE subscription_payments SET reversed_units = ${take} WHERE asaas_payment_id = ${p.id}`
}

/**
 * Processa um evento do Asaas numa transação: o registro do evento e o seu
 * efeito entram juntos. Repetição (entrega "at least once") não tem efeito.
 * Eventos que não são de assinatura do CalorIA são só registrados.
 */
export async function handleAsaasEvent(
  f: FastifyInstance,
  ev: AsaasEvent,
): Promise<WebhookOutcome> {
  return f.db.begin(async (tx) => {
    const resource = ev.payment?.id ?? ev.subscription?.id ?? null
    const fresh = await tx`
      INSERT INTO payment_webhook_events(event_id, event, resource_id) VALUES(${ev.id}, ${ev.event}, ${resource})
      ON CONFLICT (event_id) DO NOTHING RETURNING event_id`
    if (!fresh.length) return 'duplicate'

    if (ev.event === 'SUBSCRIPTION_DELETED' || ev.event === 'SUBSCRIPTION_INACTIVATED') {
      if (!ev.subscription?.id) return 'ignored'
      const rows = await tx`
        UPDATE subscriptions SET status = 'canceled',
          cancel_at_period_end = (paid_until IS NOT NULL AND paid_until > now()),
          canceled_at = COALESCE(canceled_at, now()), updated_at = now()
        WHERE asaas_subscription_id = ${ev.subscription.id} AND status <> 'canceled'
        RETURNING id`
      return rows.length ? 'subscription_canceled' : 'ignored'
    }

    const p = ev.payment
    if (!p?.id || !ev.event.startsWith('PAYMENT_')) return 'ignored'
    // Cobrança avulsa (sem assinatura): recarga de créditos.
    if (!p.subscription) return handlePurchaseEvent(tx, ev.event, p)
    const [sub] = await tx<SubRow[]>`
      SELECT id, user_id, status, cycle, credits_per_cycle, paid_until FROM subscriptions
      WHERE asaas_subscription_id = ${p.subscription} FOR UPDATE`
    if (!sub) return 'ignored'
    const status = statusFromEvent(ev.event)

    if (PAID.has(ev.event)) {
      await markPaid(tx, sub, p, status)
      return 'paid'
    }
    if (REVERSED.has(ev.event)) {
      await markReversed(tx, sub, p, status)
      return 'reversed'
    }
    if (ev.event === 'PAYMENT_OVERDUE') {
      await upsertPaymentStatus(tx, sub, p, status)
      await tx`
        UPDATE subscriptions SET status = 'past_due', updated_at = now()
        WHERE id = ${sub.id} AND status IN ('pending','active')`
      return 'overdue'
    }
    if (
      ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_DELETED', 'PAYMENT_RESTORED'].includes(
        ev.event,
      )
    ) {
      await upsertPaymentStatus(
        tx,
        sub,
        p,
        ev.event === 'PAYMENT_DELETED' ? 'DELETED' : (p.status ?? 'PENDING'),
      )
      return 'payment_updated'
    }
    return 'ignored'
  })
}

interface PurchaseRow {
  id: string
  user_id: string | null
  status: string
  credits: number
  credited_units: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Recarga de créditos (spec 2026-11-12). Acha a compra pelo id do pagamento;
 * se o webhook chegar antes de o id ser gravado, pelo externalReference (id
 * local). Créditos uma vez por pagamento; estorno retira até o saldo.
 */
async function handlePurchaseEvent(
  tx: Tx,
  event: string,
  p: NonNullable<AsaasEvent['payment']>,
): Promise<WebhookOutcome> {
  let [purchase] = await tx<PurchaseRow[]>`
    SELECT id, user_id, status, credits, credited_units FROM credit_purchases
    WHERE asaas_payment_id = ${p.id} FOR UPDATE`
  if (!purchase && p.externalReference && UUID.test(p.externalReference))
    [purchase] = await tx<PurchaseRow[]>`
      SELECT id, user_id, status, credits, credited_units FROM credit_purchases
      WHERE id = ${p.externalReference} AND (asaas_payment_id IS NULL OR asaas_payment_id = ${p.id})
      FOR UPDATE`
  if (!purchase) return 'ignored'

  if (PAID.has(event)) {
    if (purchase.status === 'refunded' || purchase.credited_units > 0) return 'purchase_paid'
    const units = purchase.credits * CREDIT_POLICY.units_per_credit
    await tx`
      UPDATE credit_purchases SET status = 'paid', paid_at = COALESCE(paid_at, now()),
        asaas_payment_id = ${p.id}, updated_at = now()
      WHERE id = ${purchase.id}`
    if (!purchase.user_id) return 'purchase_paid'
    await ensureWallet(tx, purchase.user_id)
    await tx`SELECT user_id FROM credit_wallets WHERE user_id = ${purchase.user_id} FOR UPDATE`
    const inserted = await tx`
      INSERT INTO credit_ledger(user_id, kind, units, payment_ref)
      VALUES(${purchase.user_id}, 'purchase', ${units}, ${p.id})
      ON CONFLICT (payment_ref, kind) DO NOTHING RETURNING id`
    if (inserted.length) {
      await tx`UPDATE credit_wallets SET balance_units = balance_units + ${units} WHERE user_id = ${purchase.user_id}`
      await tx`UPDATE credit_purchases SET credited_units = ${units} WHERE id = ${purchase.id}`
    }
    return 'purchase_paid'
  }

  if (REVERSED.has(event)) {
    if (purchase.status === 'refunded') return 'purchase_reversed'
    await tx`UPDATE credit_purchases SET status = 'refunded', updated_at = now() WHERE id = ${purchase.id}`
    if (!purchase.user_id || purchase.credited_units <= 0) return 'purchase_reversed'
    const [w] = await tx<{ available: number }[]>`
      SELECT balance_units - reserved_units AS available FROM credit_wallets
      WHERE user_id = ${purchase.user_id} FOR UPDATE`
    const take = Math.min(purchase.credited_units, Math.max(0, w?.available ?? 0))
    if (take <= 0) return 'purchase_reversed'
    const inserted = await tx`
      INSERT INTO credit_ledger(user_id, kind, units, payment_ref)
      VALUES(${purchase.user_id}, 'purchase_reversal', ${-take}, ${p.id})
      ON CONFLICT (payment_ref, kind) DO NOTHING RETURNING id`
    if (inserted.length) {
      await tx`UPDATE credit_wallets SET balance_units = balance_units - ${take} WHERE user_id = ${purchase.user_id}`
      await tx`UPDATE credit_purchases SET reversed_units = ${take} WHERE id = ${purchase.id}`
    }
    return 'purchase_reversed'
  }

  if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_OVERDUE') {
    await tx`
      UPDATE credit_purchases SET status = ${event === 'PAYMENT_DELETED' ? 'canceled' : 'expired'},
        updated_at = now()
      WHERE id = ${purchase.id} AND status = 'pending'`
    return 'purchase_closed'
  }
  if (event === 'PAYMENT_RESTORED') {
    await tx`UPDATE credit_purchases SET status = 'pending', updated_at = now()
      WHERE id = ${purchase.id} AND status IN ('canceled','expired')`
    return 'purchase_closed'
  }
  return 'ignored'
}
