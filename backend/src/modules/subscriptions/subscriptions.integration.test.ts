import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { runCreditOperation, wallet } from '../credits/credits.service.js'
import { type AsaasEvent, handleAsaasEvent } from './asaas-webhook.service.js'
import type { AsaasClient } from './asaas.client.js'
import { checkoutPurchase } from './credit-purchases.service.js'
import { cancelMySubscription, checkout } from './subscriptions.service.js'

const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')

export const SUBSCRIPTION_MIGRATIONS = [
  '20261016012212_credits_and_invites.sql',
  '20261021204335_credits_deletion_key_fix.sql',
  '20261023120000_credit_grants_unlimited.sql',
  '026_subscriptions.sql',
  '027_credit_purchases.sql',
  '028_credit_purchases_inflight_index.sql',
]

/** Recria os schemas do banco descartável e aplica as migrações de crédito e assinatura. */
export async function resetSubscriptionSchema(db: postgres.Sql) {
  const [name] = await db`SELECT current_database() AS name`
  if (!String(name.name).includes('credits_test'))
    throw new Error('Database name must contain credits_test; harness recreates schemas')
  await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,full_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON profiles TO anon,authenticated;`)
  for (const migration of SUBSCRIPTION_MIGRATIONS)
    await db.unsafe(
      await readFile(new URL(`../../../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
    )
}
;(url ? describe : describe.skip)('assinaturas / migração em PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5, onnotice: () => {} })
  const user = randomUUID()
  beforeAll(() => resetSubscriptionSchema(db))
  beforeEach(async () => {
    await db`TRUNCATE credit_purchases,credit_packages,payment_webhook_events,subscription_payments,subscriptions,subscription_plans,payment_customers,credit_ledger,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user})`
  })
  afterAll(async () => {
    await db.end()
  })

  const plan = (over: Record<string, unknown> = {}) => {
    const p = {
      code: 'pro',
      name: 'Pro',
      price_cents: 2990,
      cycle: 'MONTHLY',
      credits_per_cycle: 100,
      unlimited: false,
      ...over,
    }
    return db`INSERT INTO subscription_plans(code,name,price_cents,cycle,credits_per_cycle,unlimited)
      VALUES(${p.code as string},${p.name as string},${p.price_cents as number},${p.cycle as string},${(p.credits_per_cycle as number | null) ?? null},${p.unlimited as boolean}) RETURNING id`
  }
  const subscription = async (status: string, planId: string, who: string | null = user) =>
    db`INSERT INTO subscriptions(user_id,plan_id,status,price_cents,cycle,credits_per_cycle,unlimited)
      VALUES(${who},${planId},${status},2990,'MONTHLY',100,false) RETURNING id`

  it('planos: recusa preço, ciclo, código e benefício inválidos', async () => {
    const [ok] = await plan()
    expect(ok.id).toBeTruthy()
    for (const over of [
      { code: 'a', price_cents: 50 },
      { code: 'b1', cycle: 'WEEKLY' },
      { code: 'Com Espaço' },
      { code: 'c1', credits_per_cycle: null, unlimited: false },
      { code: 'd1', price_cents: 2_000_000 },
    ])
      await expect(plan(over)).rejects.toMatchObject({ code: '23514' })
    await expect(plan()).rejects.toMatchObject({ code: '23505' })
    const [unl] = await plan({ code: 'ilimitado', credits_per_cycle: null, unlimited: true })
    expect(unl.id).toBeTruthy()
  })

  it('uma assinatura aberta por usuário; canceladas não contam', async () => {
    const [p] = await plan()
    await subscription('canceled', p.id)
    await subscription('pending', p.id)
    await expect(subscription('active', p.id)).rejects.toMatchObject({ code: '23505' })
    await db`UPDATE subscriptions SET status='canceled' WHERE status='pending'`
    const [again] = await subscription('active', p.id)
    expect(again.id).toBeTruthy()
  })

  it('extrato: crédito de assinatura é único por pagamento e imutável', async () => {
    const insert = (kind: string, units: number, ref = 'pay_1') =>
      db`INSERT INTO credit_ledger(user_id,kind,units,payment_ref) VALUES(${user},${kind},${units},${ref}) RETURNING id`
    const [row] = await insert('subscription', 500)
    await expect(insert('subscription', 500)).rejects.toMatchObject({ code: '23505' })
    await insert('subscription_reversal', -500)
    await expect(insert('subscription', 0, 'pay_2')).rejects.toMatchObject({ code: '23514' })
    await expect(insert('subscription_reversal', 5, 'pay_3')).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      db`UPDATE credit_ledger SET payment_ref='pay_x' WHERE id=${row.id}`,
    ).rejects.toThrow('credit ledger is append only')
    // Tipos antigos continuam valendo.
    await db`INSERT INTO credit_ledger(user_id,kind,units) VALUES(${user},'welcome',75)`
  })

  it('exclusão de conta: histórico fica sem vínculo; cliente Asaas some', async () => {
    const [p] = await plan()
    const [s] = await subscription('active', p.id)
    await db`INSERT INTO payment_customers(user_id,asaas_customer_id) VALUES(${user},'cus_1')`
    await db`INSERT INTO subscription_payments(asaas_payment_id,subscription_id,status) VALUES('pay_1',${s.id},'CONFIRMED')`
    await db`INSERT INTO credit_ledger(user_id,kind,units,payment_ref) VALUES(${user},'subscription',500,'pay_1')`
    await db`DELETE FROM auth.users WHERE id=${user}`
    const [sub] = await db`SELECT user_id FROM subscriptions WHERE id=${s.id}`
    expect(sub.user_id).toBeNull()
    expect(await db`SELECT 1 FROM payment_customers`).toHaveLength(0)
    expect(await db`SELECT 1 FROM subscription_payments`).toHaveLength(1)
    const [led] = await db`SELECT user_id FROM credit_ledger WHERE payment_ref='pay_1'`
    expect(led.user_id).toBeNull()
  })

  it('tabelas novas não ficam acessíveis ao cliente', async () => {
    const rows = await db`SELECT table_name FROM information_schema.role_table_grants
      WHERE grantee IN ('anon','authenticated') AND table_name IN
      ('subscription_plans','payment_customers','subscriptions','subscription_payments','payment_webhook_events')`
    expect(rows).toHaveLength(0)
  })
})
;(url ? describe : describe.skip)('assinaturas / webhook e créditos em PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5, onnotice: () => {} })
  const noop = () => {}
  const f = {
    db,
    log: { info: noop, warn: noop, error: noop, debug: noop },
  } as unknown as FastifyInstance
  const user = randomUUID()
  let planId = ''
  const flags = { credits: env.CREDITS_ENFORCEMENT_ENABLED, subs: env.SUBSCRIPTIONS_ENABLED }
  beforeAll(() => resetSubscriptionSchema(db))
  beforeEach(async () => {
    await db`TRUNCATE credit_purchases,credit_packages,payment_webhook_events,subscription_payments,subscriptions,subscription_plans,payment_customers,credit_ledger,credit_operations,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user})`
    await db`INSERT INTO profiles(id) VALUES(${user})`
    const [p] =
      await db`INSERT INTO subscription_plans(code,name,price_cents,cycle,credits_per_cycle,unlimited)
      VALUES('pro','Pro',2990,'MONTHLY',100,false) RETURNING id`
    planId = p.id
  })
  afterAll(async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = flags.credits
    env.SUBSCRIPTIONS_ENABLED = flags.subs
    await db.end()
  })

  const subscribe = (
    over: { credits?: number | null; unlimited?: boolean; status?: string } = {},
  ) =>
    db`INSERT INTO subscriptions(user_id,plan_id,asaas_subscription_id,status,price_cents,cycle,credits_per_cycle,unlimited)
      VALUES(${user},${planId},'sub_1',${over.status ?? 'pending'},2990,'MONTHLY',
        ${over.credits === undefined ? 100 : over.credits},${over.unlimited ?? false}) RETURNING id`
  const payment = (event: string, id = `evt_${randomUUID()}`, pay = 'pay_1'): AsaasEvent => ({
    id,
    event,
    payment: {
      id: pay,
      subscription: 'sub_1',
      value: 29.9,
      dueDate: '2026-11-09',
      invoiceUrl: 'https://asaas/i/1',
    },
  })
  const withStatus = (e: AsaasEvent, status: string): AsaasEvent =>
    e.payment ? { ...e, payment: { ...e.payment, status } } : e
  const balance = async () =>
    (await db`SELECT balance_units FROM credit_wallets WHERE user_id=${user}`)[0]?.balance_units
  const sub = async () => (await db`SELECT * FROM subscriptions WHERE user_id=${user}`)[0]

  it('pagamento confirmado: ativa, libera o ciclo e credita uma vez só', async () => {
    await subscribe()
    expect(await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED', 'evt_1'))).toBe('paid')
    const s = await sub()
    expect(s.status).toBe('active')
    // 09/11 + 1 mês + 1 dia, meia-noite em São Paulo (03:00 UTC).
    expect(new Date(s.paid_until).toISOString()).toBe('2026-12-10T03:00:00.000Z')
    expect(await balance()).toBe(75 + 500)
    // Mesmo evento de novo, e depois RECEIVED do mesmo pagamento: nada muda.
    expect(await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED', 'evt_1'))).toBe('duplicate')
    expect(await handleAsaasEvent(f, payment('PAYMENT_RECEIVED', 'evt_2'))).toBe('paid')
    expect(await balance()).toBe(75 + 500)
    const ledger =
      await db`SELECT kind,units FROM credit_ledger WHERE user_id=${user} AND kind='subscription'`
    expect(ledger).toEqual([{ kind: 'subscription', units: 500 }])
    // Fora de ordem: PAYMENT_CREATED atrasado não volta o pagamento a "em aberto".
    await handleAsaasEvent(f, payment('PAYMENT_CREATED', 'evt_3'))
    const [p] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(p.status).toBe('RECEIVED')
  })

  it('renovação estende a partir do vencimento seguinte e credita de novo', async () => {
    await subscribe()
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    await handleAsaasEvent(f, {
      id: 'evt_renova',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_2', subscription: 'sub_1', value: 29.9, dueDate: '2026-12-09' },
    })
    expect(new Date((await sub()).paid_until).toISOString()).toBe('2027-01-10T03:00:00.000Z')
    expect(await balance()).toBe(75 + 1000)
  })

  it('estorno: retira até o saldo disponível e encerra o período', async () => {
    await subscribe()
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    // O usuário já gastou parte: sobram 175 unidades.
    await db`UPDATE credit_wallets SET balance_units=175 WHERE user_id=${user}`
    expect(await handleAsaasEvent(f, payment('PAYMENT_REFUNDED'))).toBe('reversed')
    expect(await balance()).toBe(0)
    expect(new Date((await sub()).paid_until).getTime()).toBeLessThanOrEqual(Date.now())
    // Chargeback depois do estorno não retira de novo.
    await db`UPDATE credit_wallets SET balance_units=300 WHERE user_id=${user}`
    await handleAsaasEvent(f, payment('PAYMENT_CHARGEBACK_REQUESTED'))
    expect(await balance()).toBe(300)
    const rev = await db`SELECT units FROM credit_ledger WHERE kind='subscription_reversal'`
    expect(rev).toEqual([{ units: -175 }])
    // Confirmação atrasada depois do estorno não libera nada.
    await handleAsaasEvent(f, payment('PAYMENT_RECEIVED'))
    expect(await balance()).toBe(300)
  })

  it('evento genérico com status de estorno não impede o estorno de valer', async () => {
    await subscribe()
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    expect(await balance()).toBe(75 + 500)
    expect(await handleAsaasEvent(f, withStatus(payment('PAYMENT_UPDATED'), 'REFUNDED'))).toBe(
      'payment_updated',
    )
    expect(await handleAsaasEvent(f, withStatus(payment('PAYMENT_REFUNDED'), 'REFUNDED'))).toBe(
      'reversed',
    )
    expect(await balance()).toBe(75)
    expect(new Date((await sub()).paid_until).getTime()).toBeLessThanOrEqual(Date.now())
    const [p] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(p.status).toBe('REFUNDED')
  })

  it('evento genérico com status pago não marca pagamento novo como pago', async () => {
    await subscribe()
    await handleAsaasEvent(f, withStatus(payment('PAYMENT_UPDATED'), 'CONFIRMED'))
    const [p] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(p.status).toBe('PENDING')
    // Pagamento em atraso continua em atraso.
    await handleAsaasEvent(f, payment('PAYMENT_OVERDUE'))
    await handleAsaasEvent(f, withStatus(payment('PAYMENT_UPDATED'), 'RECEIVED'))
    const [q] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(q.status).toBe('OVERDUE')
    expect((await sub()).paid_until).toBeNull()
    expect(await balance()).toBeUndefined()
  })

  it('atraso atrasado depois da confirmação mantém a assinatura ativa', async () => {
    await subscribe()
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    expect(await handleAsaasEvent(f, payment('PAYMENT_OVERDUE'))).toBe('overdue')
    expect((await sub()).status).toBe('active')
    const [p] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(p.status).toBe('CONFIRMED')
  })

  it('atraso numa assinatura nunca paga mantém pending', async () => {
    await subscribe()
    expect(await handleAsaasEvent(f, payment('PAYMENT_OVERDUE'))).toBe('overdue')
    expect((await sub()).status).toBe('pending')
    const [p] = await db`SELECT status FROM subscription_payments WHERE asaas_payment_id='pay_1'`
    expect(p.status).toBe('OVERDUE')
  })

  it('atraso, cancelamento e evento de fora do CalorIA', async () => {
    await subscribe({ status: 'active' })
    expect(await handleAsaasEvent(f, payment('PAYMENT_OVERDUE'))).toBe('overdue')
    expect((await sub()).status).toBe('past_due')
    expect(
      await handleAsaasEvent(f, {
        id: 'evt_del',
        event: 'SUBSCRIPTION_DELETED',
        subscription: { id: 'sub_1' },
      }),
    ).toBe('subscription_canceled')
    expect((await sub()).status).toBe('canceled')
    expect(
      await handleAsaasEvent(f, {
        id: 'evt_outro',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay_x', subscription: 'sub_de_outro_produto' },
      }),
    ).toBe('ignored')
    expect(
      await handleAsaasEvent(f, {
        id: 'evt_avulso',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay_y' },
      }),
    ).toBe('ignored')
    const events = await db`SELECT event_id FROM payment_webhook_events ORDER BY event_id`
    expect(events.map((e) => e.event_id)).toContain('evt_outro')
  })

  it('plano ilimitado pago: foto não debita; vencido, volta a debitar', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    env.SUBSCRIPTIONS_ENABLED = true
    await subscribe({ credits: null, unlimited: true })
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    const op = (key: string) =>
      runCreditOperation(
        f,
        { userId: user, key, payload: { k: key }, type: 'photo', costUnits: 15 },
        async () => 'ok',
      )
    const pago = await op('chave-ilimitado-0001')
    expect(pago.receipt).toBeNull()
    expect((await wallet(f, user)).unlimited).toBe(true)
    expect(await balance()).toBe(75)

    await db`UPDATE subscriptions SET paid_until = now() - interval '1 minute' WHERE user_id=${user}`
    const vencido = await op('chave-ilimitado-0002')
    expect(vencido.receipt?.charged_units).toBe(15)
    expect((await wallet(f, user)).unlimited).toBe(false)
  })

  it('flag desligada: a cobrança de créditos ignora a assinatura', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    env.SUBSCRIPTIONS_ENABLED = false
    await subscribe({ credits: null, unlimited: true })
    await handleAsaasEvent(f, payment('PAYMENT_CONFIRMED'))
    const r = await runCreditOperation(
      f,
      { userId: user, key: 'chave-flag-off-00001', payload: {}, type: 'photo', costUnits: 15 },
      async () => 'ok',
    )
    expect(r.receipt?.charged_units).toBe(15)
  })
})
;(url ? describe : describe.skip)('recarga de créditos / webhook em PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5, onnotice: () => {} })
  const noop = () => {}
  const f = {
    db,
    log: { info: noop, warn: noop, error: noop, debug: noop },
  } as unknown as FastifyInstance
  const user = randomUUID()
  let purchaseId = ''
  const purchasesFlag = env.CREDIT_PURCHASES_ENABLED
  beforeAll(async () => {
    env.CREDIT_PURCHASES_ENABLED = true
    await resetSubscriptionSchema(db)
  })
  beforeEach(async () => {
    await db`TRUNCATE credit_purchases,credit_packages,payment_webhook_events,payment_customers,credit_ledger,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user})`
    const [p] =
      await db`INSERT INTO credit_packages(code,name,credits,price_cents) VALUES('p10','10 créditos',10,6000) RETURNING id`
    const [c] =
      await db`INSERT INTO credit_purchases(user_id,package_id,credits,price_cents,asaas_payment_id)
      VALUES(${user},${p.id},10,6000,'pay_c1') RETURNING id`
    purchaseId = c.id
  })
  afterAll(async () => {
    env.CREDIT_PURCHASES_ENABLED = purchasesFlag
    await db.end()
  })
  const ev = (
    event: string,
    id = `evt_${randomUUID()}`,
    pay = 'pay_c1',
    ref?: string,
  ): AsaasEvent => ({
    id,
    event,
    payment: { id: pay, value: 60, dueDate: '2026-11-13', externalReference: ref },
  })
  const balance = async () =>
    (await db`SELECT balance_units FROM credit_wallets WHERE user_id=${user}`)[0]?.balance_units
  const purchase = async () => (await db`SELECT * FROM credit_purchases WHERE id=${purchaseId}`)[0]

  it('pago: credita 10 créditos (50 unidades) uma vez, mesmo com CONFIRMED + RECEIVED e repetição', async () => {
    expect(await handleAsaasEvent(f, ev('PAYMENT_CONFIRMED', 'evt_a'))).toBe('purchase_paid')
    expect(await handleAsaasEvent(f, ev('PAYMENT_CONFIRMED', 'evt_a'))).toBe('duplicate')
    expect(await handleAsaasEvent(f, ev('PAYMENT_RECEIVED', 'evt_b'))).toBe('purchase_paid')
    expect(await balance()).toBe(75 + 50)
    const p = await purchase()
    expect(p.status).toBe('paid')
    expect(p.paid_at).not.toBeNull()
    expect(await db`SELECT units FROM credit_ledger WHERE kind='purchase'`).toEqual([{ units: 50 }])
  })

  it('webhook antes de gravar o id do pagamento: acha pela referência', async () => {
    await db`UPDATE credit_purchases SET asaas_payment_id=NULL WHERE id=${purchaseId}`
    expect(await handleAsaasEvent(f, ev('PAYMENT_RECEIVED', 'evt_c', 'pay_novo', purchaseId))).toBe(
      'purchase_paid',
    )
    expect((await purchase()).asaas_payment_id).toBe('pay_novo')
    expect(await balance()).toBe(125)
  })

  it('estorno: retira até o saldo; segundo estorno e confirmação atrasada não mexem', async () => {
    await handleAsaasEvent(f, ev('PAYMENT_CONFIRMED'))
    await db`UPDATE credit_wallets SET balance_units=20 WHERE user_id=${user}`
    expect(await handleAsaasEvent(f, ev('PAYMENT_REFUNDED'))).toBe('purchase_reversed')
    expect(await balance()).toBe(0)
    expect((await purchase()).status).toBe('refunded')
    await db`UPDATE credit_wallets SET balance_units=100 WHERE user_id=${user}`
    await handleAsaasEvent(f, ev('PAYMENT_CHARGEBACK_REQUESTED'))
    await handleAsaasEvent(f, ev('PAYMENT_RECEIVED'))
    expect(await balance()).toBe(100)
    expect(await db`SELECT units FROM credit_ledger WHERE kind='purchase_reversal'`).toEqual([
      { units: -20 },
    ])
  })

  it('vencida ou removida sem pagamento fecha a compra; pagamento de outro sistema é ignorado', async () => {
    expect(await handleAsaasEvent(f, ev('PAYMENT_OVERDUE'))).toBe('purchase_closed')
    expect((await purchase()).status).toBe('expired')
    expect(await handleAsaasEvent(f, ev('PAYMENT_CONFIRMED', 'evt_x', 'pay_de_outro'))).toBe(
      'ignored',
    )
    expect(await balance()).toBeUndefined()
  })

  const purchaseAsaas = (): AsaasClient => ({
    createCustomer: async () => ({ id: 'cus_1' }),
    createSubscription: async () => ({ id: 'sub_x' }),
    createPayment: async () => ({
      id: 'pay_nova',
      status: 'PENDING',
      invoiceUrl: 'https://asaas/i/n',
    }),
    listSubscriptionPayments: async () => [],
    deleteSubscription: async () => {},
  })

  it('compra presa sem id do Asaas: o evento grava o id e fecha; o pacote volta a ser comprável', async () => {
    await db`UPDATE credit_purchases SET status='paid' WHERE id=${purchaseId}`
    await db`INSERT INTO payment_customers(user_id,asaas_customer_id) VALUES(${user},'cus_1')`
    const [stuck] =
      await db`INSERT INTO credit_purchases(user_id,package_id,credits,price_cents,created_at)
      SELECT ${user}, package_id, 10, 6000, now() - interval '3 days' FROM credit_purchases
      WHERE id=${purchaseId} RETURNING id`
    expect(
      await handleAsaasEvent(f, ev('PAYMENT_OVERDUE', 'evt_stuck', 'pay_stuck', stuck.id)),
    ).toBe('purchase_closed')
    const [row] =
      await db`SELECT status, asaas_payment_id FROM credit_purchases WHERE id=${stuck.id}`
    expect(row).toEqual({ status: 'expired', asaas_payment_id: 'pay_stuck' })
    const r = await checkoutPurchase(f, purchaseAsaas(), user, { package_code: 'p10' })
    expect(r.purchase_id).not.toBe(stuck.id)
  })

  it('migração: compra sem id que já não está pending não barra uma compra nova', async () => {
    await db`UPDATE credit_purchases SET status='paid' WHERE id=${purchaseId}`
    await db`INSERT INTO payment_customers(user_id,asaas_customer_id) VALUES(${user},'cus_1')`
    await db`INSERT INTO credit_purchases(user_id,package_id,credits,price_cents,status)
      SELECT ${user}, package_id, 10, 6000, 'expired' FROM credit_purchases WHERE id=${purchaseId}`
    const r = await checkoutPurchase(f, purchaseAsaas(), user, { package_code: 'p10' })
    const [row] = await db`SELECT asaas_payment_id FROM credit_purchases WHERE id=${r.purchase_id}`
    expect(row.asaas_payment_id).toBe('pay_nova')
  })

  it('migração: pacote abaixo de R$ 5 é recusado; uma compra em criação por pacote', async () => {
    const [p] = await db`SELECT id FROM credit_packages WHERE code='p10'`
    await expect(
      db`INSERT INTO credit_packages(code,name,credits,price_cents) VALUES('p1','1',1,400)`,
    ).rejects.toMatchObject({ code: '23514' })
    await db`INSERT INTO credit_purchases(user_id,package_id,credits,price_cents) VALUES(${user},${p.id},10,6000)`
    await expect(
      db`INSERT INTO credit_purchases(user_id,package_id,credits,price_cents) VALUES(${user},${p.id},10,6000)`,
    ).rejects.toMatchObject({ code: '23505' })
    await db`DELETE FROM auth.users WHERE id=${user}`
    expect((await purchase()).user_id).toBeNull()
  })
})
;(url ? describe : describe.skip)('assinaturas / checkout concorrente em PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5, onnotice: () => {} })
  const noop = () => {}
  const f = {
    db,
    log: { info: noop, warn: noop, error: noop, debug: noop },
  } as unknown as FastifyInstance
  const user = randomUUID()
  const BODY = { plan_code: 'pro', cpf_cnpj: '529.982.247-25', name: 'Ana Souza' }
  beforeAll(() => resetSubscriptionSchema(db))
  beforeEach(async () => {
    await db`TRUNCATE credit_purchases,credit_packages,payment_webhook_events,subscription_payments,subscriptions,subscription_plans,payment_customers,credit_ledger,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user})`
    await db`INSERT INTO payment_customers(user_id,asaas_customer_id) VALUES(${user},'cus_1')`
    await db`INSERT INTO subscription_plans(code,name,price_cents,cycle,credits_per_cycle) VALUES('pro','Pro',2990,'MONTHLY',100)`
  })
  afterAll(async () => {
    await db.end()
  })

  /** Fake do Asaas cujo createSubscription pode ficar parado até `release()`. */
  function gatedAsaas() {
    const created: string[] = []
    const deleted: string[] = []
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const inside = new Promise<void>((r) => {
      entered = r
    })
    let parked = true
    const client: AsaasClient = {
      createCustomer: async () => ({ id: 'cus_1' }),
      createSubscription: async () => {
        const id = `sub_${created.length + 1}`
        created.push(id)
        if (parked) {
          parked = false
          entered()
          await gate
        }
        return { id }
      },
      createPayment: async () => ({ id: 'pay_x', status: 'PENDING' }),
      listSubscriptionPayments: async () => [],
      deleteSubscription: async (id) => {
        deleted.push(id)
      },
    }
    return { client, created, deleted, release, inside }
  }
  const open = () =>
    db`SELECT id, status, asaas_subscription_id FROM subscriptions
      WHERE user_id=${user} AND status IN ('pending','active','past_due')`

  it('dois toques: o segundo checkout recebe 409 e só uma assinatura é criada no Asaas', async () => {
    const a = gatedAsaas()
    const first = checkout(f, a.client, user, BODY)
    await a.inside
    await expect(checkout(f, a.client, user, BODY)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHECKOUT_IN_PROGRESS',
    })
    a.release()
    const r = await first
    expect(a.created).toEqual(['sub_1'])
    expect(a.deleted).toEqual([])
    const rows = await open()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: r.subscription_id, asaas_subscription_id: 'sub_1' })
  })

  it('linha cancelada durante a criação: a assinatura nova é cancelada no Asaas e o checkout dá 409', async () => {
    const a = gatedAsaas()
    const first = checkout(f, a.client, user, BODY)
    await a.inside
    await cancelMySubscription(f, a.client, user)
    a.release()
    await expect(first).rejects.toMatchObject({ statusCode: 409, code: 'CHECKOUT_IN_PROGRESS' })
    expect(a.deleted).toEqual(['sub_1'])
    expect(await open()).toHaveLength(0)
    const [row] = await db`SELECT status, asaas_subscription_id FROM subscriptions`
    expect(row).toMatchObject({ status: 'canceled', asaas_subscription_id: null })
  })

  it('pending sem id há mais de 10 minutos é abandonada: o checkout novo cancela e segue', async () => {
    const [plan] = await db`SELECT id FROM subscription_plans WHERE code='pro'`
    const [old] =
      await db`INSERT INTO subscriptions(user_id,plan_id,status,price_cents,cycle,credits_per_cycle,unlimited,created_at)
      VALUES(${user},${plan.id},'pending',2990,'MONTHLY',100,false,now() - interval '11 minutes') RETURNING id`
    const a = gatedAsaas()
    a.release()
    const r = await checkout(f, a.client, user, BODY)
    expect(r.subscription_id).not.toBe(old.id)
    expect(a.created).toEqual(['sub_1'])
    const [prev] = await db`SELECT status FROM subscriptions WHERE id=${old.id}`
    expect(prev.status).toBe('canceled')
  })
})
