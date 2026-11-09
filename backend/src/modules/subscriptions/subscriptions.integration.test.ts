import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')

export const SUBSCRIPTION_MIGRATIONS = [
  '20261016012212_credits_and_invites.sql',
  '20261021204335_credits_deletion_key_fix.sql',
  '20261023120000_credit_grants_unlimited.sql',
  '026_subscriptions.sql',
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
    await db`TRUNCATE payment_webhook_events,subscription_payments,subscriptions,subscription_plans,payment_customers,credit_ledger,credit_wallets,profiles,auth.users CASCADE`
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
