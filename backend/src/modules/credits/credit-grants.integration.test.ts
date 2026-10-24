import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { grantCredits, setUnlimited } from './credit-grants.service.js'

const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')
;(url ? describe : describe.skip)('credit grants / real PostgreSQL', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5 })
  const user = randomUUID()
  const admin = randomUUID()
  beforeAll(async () => {
    const [name] = await db`SELECT current_database() AS name`
    if (!String(name.name).includes('credits_test'))
      throw new Error('Database name must contain credits_test; harness recreates schemas')
    await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,full_name text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON profiles TO anon,authenticated;`)
    for (const migration of [
      '20261016012212_credits_and_invites.sql',
      '20261021204335_credits_deletion_key_fix.sql',
      '20261023120000_credit_grants_unlimited.sql',
    ])
      await db.unsafe(
        await readFile(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
  })
  beforeEach(async () => {
    await db`TRUNCATE credit_ledger,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user}),(${admin})`
  })
  afterAll(async () => {
    await db.end()
  })
  const grant = (units: number, key: string | null = randomUUID()) =>
    db`INSERT INTO credit_ledger(user_id,actor_id,kind,units,note,idempotency_key) VALUES(${user},${admin},'grant',${units},'cortesia',${key}) RETURNING id`

  it('aceita grant com actor e recusa grant fora da faixa', async () => {
    const [row] = await grant(250)
    expect(row.id).toBeTruthy()
    for (const units of [0, 5005, -5, 4])
      await expect(grant(units)).rejects.toMatchObject({ code: '23514' })
    await expect(db`UPDATE credit_ledger SET note='outra' WHERE id=${row.id}`).rejects.toThrow(
      'credit ledger is append only',
    )
    await expect(
      db`UPDATE credit_ledger SET idempotency_key='x' WHERE id=${row.id}`,
    ).rejects.toThrow('credit ledger is append only')
  })

  it('mantém welcome/debit e a pseudonimização na exclusão de conta', async () => {
    await expect(
      db`INSERT INTO credit_ledger(user_id,kind,units) VALUES(${user},'debit',-3)`,
    ).resolves.toBeDefined()
    await grant(10, 'k1')
    await db`DELETE FROM auth.users WHERE id=${admin}`
    const [r] = await db`SELECT actor_id FROM credit_ledger WHERE idempotency_key='k1'`
    expect(r.actor_id).toBeNull()
  })

  it('idempotency_key é única por actor e carteira nasce sem ilimitado', async () => {
    await grant(10, 'same')
    await expect(grant(10, 'same')).rejects.toMatchObject({ code: '23505' })
    await db`INSERT INTO credit_wallets(user_id) VALUES(${user})`
    const [w] = await db`SELECT unlimited,unlimited_by,unlimited_since FROM credit_wallets`
    expect(w).toEqual({ unlimited: false, unlimited_by: null, unlimited_since: null })
    await expect(
      db`INSERT INTO credit_ledger(user_id,actor_id,kind,units,note) VALUES(${user},${admin},'grant',10,${'x'.repeat(101)})`,
    ).rejects.toMatchObject({ code: '23514' })
  })

  describe('serviço', () => {
    const f = { db } as unknown as FastifyInstance
    const profile = () => db`INSERT INTO profiles(id) VALUES(${user}),(${admin})`
    const rows = (kind: string) =>
      db`SELECT actor_id,note FROM credit_ledger WHERE user_id=${user} AND kind=${kind}`

    it('libera créditos (x5 unidades) com actor e nota aparada', async () => {
      await profile()
      await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${user},0)`
      const out = await grantCredits(f, admin, user, 50, 'chave-um-1234567890', '  cortesia  ')
      expect(out).toEqual({ balance_units: 250, available_units: 250, unlimited: false })
      const g = await rows('grant')
      expect(g).toHaveLength(1)
      expect(g[0]).toMatchObject({ actor_id: admin, note: 'cortesia' })
    })

    it('é idempotente por chave e devolve o mesmo saldo', async () => {
      await profile()
      const a = await grantCredits(f, admin, user, 50, 'chave-dois-1234567890')
      const b = await grantCredits(f, admin, user, 50, 'chave-dois-1234567890')
      expect(b).toEqual(a)
      expect(await rows('grant')).toHaveLength(1)
    })

    it('cria a carteira com boas-vindas: 75 + 250 = 325', async () => {
      await profile()
      const out = await grantCredits(f, admin, user, 50, 'chave-tres-1234567890')
      expect(out.balance_units).toBe(325)
      expect(await rows('welcome')).toHaveLength(1)
      expect(await rows('grant')).toHaveLength(1)
    })

    it('recusa quantidade inválida, chave ausente e conta inexistente', async () => {
      await profile()
      for (const n of [0, 1001, 2.5, -1])
        await expect(grantCredits(f, admin, user, n, 'chave-qtd-1234567890')).rejects.toMatchObject(
          {
            statusCode: 422,
            code: 'INVALID_GRANT',
          },
        )
      await expect(grantCredits(f, admin, user, 5, undefined)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      })
      await expect(
        grantCredits(f, admin, randomUUID(), 5, 'chave-nao-1234567890'),
      ).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' })
    })

    it('liga e desliga ilimitado, preservando quem/quando ao desligar', async () => {
      await profile()
      expect(await setUnlimited(f, admin, user, true)).toEqual({ unlimited: true })
      const [on] =
        await db`SELECT unlimited,unlimited_by,unlimited_since FROM credit_wallets WHERE user_id=${user}`
      expect(on.unlimited).toBe(true)
      expect(on.unlimited_by).toBe(admin)
      expect(on.unlimited_since).toBeInstanceOf(Date)
      expect(await setUnlimited(f, admin, user, false)).toEqual({ unlimited: false })
      const [off] =
        await db`SELECT unlimited,unlimited_by,unlimited_since FROM credit_wallets WHERE user_id=${user}`
      expect(off.unlimited).toBe(false)
      expect(off.unlimited_by).toBe(admin)
      await expect(setUnlimited(f, admin, randomUUID(), true)).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      })
    })
  })
})
