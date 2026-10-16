import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import {
  createInvite,
  previewInvite,
  redeemInvite,
} from '../credit-invites/credit-invites.service.js'
import {
  cancelCreditOperation,
  reconcileCreditOperations,
  runCreditOperation,
} from './credits.service.js'
const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')
;(url ? describe : describe.skip)('credits / real PostgreSQL', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 10 })
  const f = { db, log: { error: () => {}, warn: () => {} } } as unknown as FastifyInstance
  const old = [env.CREDITS_ENFORCEMENT_ENABLED, env.CREDIT_INVITES_ENABLED]
  const user = randomUUID()
  const other = randomUUID()
  const admin = randomUUID()
  beforeAll(async () => {
    const [name] = await db`SELECT current_database() AS name`
    if (!String(name.name).includes('credits_test'))
      throw new Error('Database name must contain credits_test; harness recreates schemas')
    await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,full_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON profiles TO anon,authenticated; GRANT UPDATE(is_admin),INSERT(is_admin) ON profiles TO authenticated;`)
    await db.unsafe(
      await readFile(
        new URL(
          '../../../supabase/migrations/20261016012212_credits_and_invites.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    env.CREDITS_ENFORCEMENT_ENABLED = true
    env.CREDIT_INVITES_ENABLED = true
  })
  beforeEach(async () => {
    await db`TRUNCATE credit_cancellations,credit_conversation_leases,credit_ledger,credit_welcome_claims,credit_invites,credit_operations,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user}),(${other}),(${admin})`
    await db`INSERT INTO profiles(id,is_admin) VALUES(${user},false),(${admin},true)`
    await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${user},75),(${other},0)`
  })
  afterAll(async () => {
    ;[env.CREDITS_ENFORCEMENT_ENABLED, env.CREDIT_INVITES_ENABLED] = old
    await db.end()
  })
  const input = () => ({
    userId: user,
    key: randomUUID(),
    payload: { image: 'test' },
    type: 'photo' as const,
    costUnits: 15,
  })
  it('blocks self-admin table and column grants', async () => {
    const [p] =
      await db`SELECT has_table_privilege('authenticated','profiles','UPDATE') AS t,has_column_privilege('authenticated','profiles','is_admin','UPDATE') AS u,has_column_privilege('authenticated','profiles','is_admin','INSERT') AS i`
    expect(p).toEqual({ t: false, u: false, i: false })
  })
  it('15→12→11.6 and idempotent cached retry', async () => {
    const i = input()
    let calls = 0
    const one = await runCreditOperation(f, i, async () => {
      calls++
      return { ok: true }
    })
    expect(one.receipt?.balance_units).toBe(60)
    expect(
      await runCreditOperation(f, i, async () => {
        calls++
        return { ok: false }
      }),
    ).toEqual(one)
    const two = await runCreditOperation(
      f,
      { ...input(), type: 'chat', costUnits: 2 },
      async () => ({ ok: true }),
    )
    expect(two.receipt?.balance_units).toBe(58)
    expect(calls).toBe(1)
  })
  it('concurrent spends never overspend', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => runCreditOperation(f, input(), async () => ({ ok: true }))),
    )
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
    const [w] =
      await db`SELECT balance_units,reserved_units FROM credit_wallets WHERE user_id=${user}`
    expect(w).toEqual({ balance_units: 0, reserved_units: 0 })
  })
  it('persistence failure rolls back result and debit', async () => {
    await expect(
      runCreditOperation(
        f,
        input(),
        async () => ({ ok: true }),
        async (tx) => {
          await tx`UPDATE profiles SET full_name='rollback' WHERE id=${user}`
          throw Error('failed')
        },
      ),
    ).rejects.toMatchObject({ code: 'CREDITS_UNAVAILABLE' })
    const [w] =
      await db`SELECT balance_units,reserved_units FROM credit_wallets WHERE user_id=${user}`
    expect(w).toEqual({ balance_units: 75, reserved_units: 0 })
    const [p] = await db`SELECT full_name FROM profiles WHERE id=${user}`
    expect(p.full_name).toBeNull()
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(0)
  })
  it('fences late completion after reservation recovery', async () => {
    let finish!: () => void
    let started!: () => void
    const ready = new Promise<void>((r) => {
      started = r
    })
    const wait = new Promise<void>((r) => {
      finish = r
    })
    const pending = runCreditOperation(f, input(), async () => {
      started()
      await wait
      return { ok: true }
    })
    await ready
    await db`UPDATE credit_operations SET lease_expires_at=now()-interval '1 second' WHERE user_id=${user}`
    await reconcileCreditOperations(f, user)
    finish()
    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' })
    const [w] =
      await db`SELECT balance_units,reserved_units FROM credit_wallets WHERE user_id=${user}`
    expect(w).toEqual({ balance_units: 75, reserved_units: 0 })
  })
  it('conflicting payload cannot reuse key', async () => {
    const i = input()
    await runCreditOperation(f, i, async () => ({ ok: true }))
    await expect(
      runCreditOperation(f, { ...i, payload: 'different' }, async () => ({ ok: false })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('one invite has one concurrent winner; hash only', async () => {
    const invite = await createInvite(f, admin, randomUUID())
    const token = String(invite.url).split('#')[1]
    const result = await Promise.allSettled([
      redeemInvite(f, user, token),
      redeemInvite(f, other, token),
    ])
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const [stored] = await db`SELECT * FROM credit_invites WHERE id=${invite.id}`
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(await db`SELECT * FROM credit_ledger WHERE kind='welcome'`).toHaveLength(1)
  })
  it('welcome once/account, repeat redemption safe, issuance URL shown once', async () => {
    const key = randomUUID()
    const a = await createInvite(f, admin, key)
    const b = await createInvite(f, admin, randomUUID())
    expect((await createInvite(f, admin, key)).url).toBeNull()
    const token = String(a.url).split('#')[1]
    expect((await redeemInvite(f, user, token)).granted).toBe(true)
    expect((await redeemInvite(f, user, token)).granted).toBe(false)
    await expect(redeemInvite(f, user, String(b.url).split('#')[1])).rejects.toMatchObject({
      code: 'WELCOME_ALREADY_CLAIMED',
    })
    const [row] = await db`SELECT status FROM credit_invites WHERE id=${b.id}`
    expect(row.status).toBe('active')
  })
  it('direct client table access is denied and ledger is immutable', async () => {
    await expect(
      db.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`
        await tx`SELECT * FROM credit_wallets`
      }),
    ).rejects.toMatchObject({ code: '42501' })
    await runCreditOperation(f, input(), async () => ({ ok: true }))
    await expect(db`UPDATE credit_ledger SET units=-1`).rejects.toThrow('append only')
    await expect(db`DELETE FROM credit_ledger`).rejects.toThrow('append only')
  })
  it('durable conversation lease rejects overlapping requests and releases after success', async () => {
    let finish!: () => void
    let started!: () => void
    const ready = new Promise<void>((r) => {
      started = r
    })
    const wait = new Promise<void>((r) => {
      finish = r
    })
    const first = runCreditOperation(
      f,
      { ...input(), type: 'chat', costUnits: 2, conversationId: user },
      async () => {
        started()
        await wait
        return { ok: true }
      },
    )
    await ready
    await expect(
      runCreditOperation(
        f,
        { ...input(), type: 'chat', costUnits: 2, conversationId: user },
        async () => ({ ok: true }),
      ),
    ).rejects.toMatchObject({ code: 'CONVERSATION_BUSY' })
    finish()
    await first
    expect(await db`SELECT * FROM credit_conversation_leases`).toHaveLength(0)
  })
  it('twenty concurrent requests with one key infer exactly once', async () => {
    let finish!: () => void
    let started!: () => void
    let calls = 0
    const ready = new Promise<void>((r) => {
      started = r
    })
    const wait = new Promise<void>((r) => {
      finish = r
    })
    const i = input()
    const infer = async () => {
      calls++
      started()
      await wait
      return { ok: true }
    }
    const first = runCreditOperation(f, i, infer)
    await ready
    const rest = await Promise.allSettled(
      Array.from({ length: 19 }, () => runCreditOperation(f, i, infer)),
    )
    expect(
      rest.every((r) => r.status === 'rejected' && r.reason.code === 'OPERATION_PENDING'),
    ).toBe(true)
    finish()
    await first
    expect(calls).toBe(1)
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(1)
  })
  it('lost settlement commit acknowledgement replays committed result without refund or new inference', async () => {
    let commits = 0
    const faultyDb = new Proxy(db, {
      get(target, property) {
        if (property === 'begin')
          return async (callback: (tx: postgres.TransactionSql) => Promise<unknown>) => {
            const result = await target.begin(callback)
            commits++
            if (commits === 3) throw Error('commit acknowledgement lost after PostgreSQL committed')
            return result
          }
        return Reflect.get(target, property)
      },
    })
    const faulty = { ...f, db: faultyDb } as FastifyInstance
    const i = input()
    let calls = 0
    const infer = async () => {
      calls++
      return { answer: 'durable' }
    }
    await expect(runCreditOperation(faulty, i, infer)).rejects.toMatchObject({
      code: 'CREDITS_UNAVAILABLE',
    })
    const retry = await runCreditOperation(f, i, infer)
    expect(retry.result).toEqual({ answer: 'durable' })
    expect(calls).toBe(1)
    expect(retry.receipt?.balance_units).toBe(60)
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(1)
  })
  it('preview has no monetary side effects; expired and revoked invites cannot grant', async () => {
    const a = await createInvite(f, admin, randomUUID())
    const token = String(a.url).split('#')[1]
    expect(await previewInvite(f, token)).toMatchObject({ grant_units: 75 })
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(0)
    expect(await db`SELECT * FROM credit_welcome_claims`).toHaveLength(0)
    await db`UPDATE credit_invites SET expires_at=now()-interval '1 second' WHERE id=${a.id}`
    await expect(previewInvite(f, token)).rejects.toMatchObject({ code: 'INVITE_UNAVAILABLE' })
    await expect(redeemInvite(f, user, token)).rejects.toMatchObject({ code: 'INVITE_UNAVAILABLE' })
    const b = await createInvite(f, admin, randomUUID())
    await db`UPDATE credit_invites SET status='revoked' WHERE id=${b.id}`
    await expect(redeemInvite(f, user, String(b.url).split('#')[1])).rejects.toMatchObject({
      code: 'INVITE_UNAVAILABLE',
    })
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(0)
  })
  it('cancellation before original request blocks inference for that owner only', async () => {
    const i = input()
    expect((await cancelCreditOperation(f, user, i.key)).state).toBe('cancelled')
    let calls = 0
    await expect(
      runCreditOperation(f, i, async () => {
        calls++
        return { ok: true }
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
    expect(calls).toBe(0)
    await db`UPDATE credit_wallets SET balance_units=75 WHERE user_id=${other}`
    expect(
      (await runCreditOperation(f, { ...i, userId: other }, async () => ({ ok: true }))).receipt
        ?.balance_units,
    ).toBe(60)
  })
  it('concurrent cancellation fences late completion and releases reservation exactly once', async () => {
    let finish!: () => void
    let started!: () => void
    const ready = new Promise<void>((r) => {
      started = r
    })
    const wait = new Promise<void>((r) => {
      finish = r
    })
    const i = { ...input(), type: 'chat' as const, costUnits: 2, conversationId: user }
    const pending = runCreditOperation(f, i, async () => {
      started()
      await wait
      return { ok: true }
    })
    await ready
    const cancellations = await Promise.all(
      Array.from({ length: 20 }, () => cancelCreditOperation(f, user, i.key)),
    )
    expect(cancellations.every((r) => r.state === 'cancelled')).toBe(true)
    finish()
    await expect(pending).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' })
    const [w] =
      await db`SELECT balance_units,reserved_units FROM credit_wallets WHERE user_id=${user}`
    expect(w).toEqual({ balance_units: 75, reserved_units: 0 })
    expect(await db`SELECT * FROM credit_ledger`).toHaveLength(0)
    expect(await db`SELECT * FROM credit_conversation_leases`).toHaveLength(0)
    expect(await db`SELECT * FROM credit_cancellations`).toHaveLength(1)
  })
  it('cancellation after settlement reports retained result without refund', async () => {
    const i = input()
    const result = await runCreditOperation(f, i, async () => ({ ok: true }))
    expect(await cancelCreditOperation(f, user, i.key)).toEqual({
      state: 'succeeded',
      operation_id: result.receipt?.operation_id,
      receipt: result.receipt,
    })
    expect(await db`SELECT * FROM credit_cancellations`).toHaveLength(0)
    expect(await runCreditOperation(f, i, async () => ({ ok: false }))).toEqual(result)
  })
  it('deletion clears operation content while retaining pseudonymous audit', async () => {
    await runCreditOperation(f, input(), async () => ({ private: 'delete' }))
    await db.unsafe(
      `DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='credits_test_auth_admin') THEN CREATE ROLE credits_test_auth_admin; END IF; END $$; GRANT USAGE ON SCHEMA auth TO credits_test_auth_admin; GRANT SELECT,DELETE ON auth.users TO credits_test_auth_admin;`,
    )
    await db.begin(async (tx) => {
      await tx`SET LOCAL ROLE credits_test_auth_admin`
      await tx`DELETE FROM auth.users WHERE id=${user}`
    })
    const [op] = await db`SELECT result,user_id FROM credit_operations`
    expect(op).toEqual({ result: null, user_id: null })
    const [entry] = await db`SELECT user_id,units FROM credit_ledger`
    expect(entry).toEqual({ user_id: null, units: -15 })
  })
})
