import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import fastifyJwt from '@fastify/jwt'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import adminRoutes from './admin.routes.js'

/**
 * Painel admin contra PostgreSQL REAL (spec 21/10). Recria os schemas: só em
 * banco descartável local cujo nome contém credits_test.
 */
const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')
;(url ? describe : describe.skip)('admin / real PostgreSQL', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5, onnotice: () => {} })
  const logs: unknown[] = []
  let app: FastifyInstance
  let adminAuth: Record<string, string>
  let userAuth: Record<string, string>
  const oldInvites = env.CREDIT_INVITES_ENABLED
  const ADMIN = randomUUID()
  const B = randomUUID()
  const C = randomUUID()

  beforeAll(async () => {
    const [name] = await db`SELECT current_database() AS name`
    if (!String(name.name).includes('credits_test'))
      throw new Error('Database name must contain credits_test; harness recreates schemas')
    await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
      DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
      CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text, is_admin boolean DEFAULT false, weight_kg numeric, created_at timestamptz DEFAULT now());
      CREATE TABLE meals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, meal_date date DEFAULT current_date, created_at timestamptz DEFAULT now());
      CREATE TABLE diets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, created_at timestamptz DEFAULT now());
      CREATE TABLE diet_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE streaks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, current_streak int DEFAULT 0);
      CREATE TABLE ai_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, feature text NOT NULL, model text NOT NULL, prompt_tokens int, completion_tokens int, total_tokens int, created_at timestamptz DEFAULT now());`)
    for (const migration of [
      '20261016012212_credits_and_invites.sql',
      '20261021204335_credits_deletion_key_fix.sql',
      '024_admin_indexes.sql',
    ])
      await db.unsafe(
        await readFile(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )

    app = Fastify({
      logger: {
        level: 'info',
        stream: { write: (line: string) => logs.push(JSON.parse(line)) },
      },
    }).withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(fastifyJwt, { secret: 'test-secret' })
    app.decorate('db', db as never)
    app.setErrorHandler((error: FastifyError, _req, reply) => {
      if (error instanceof AppError)
        return reply.status(error.statusCode).send({ error: error.code, message: error.message })
      if (error.validation)
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message })
      return reply.status(error.statusCode ?? 500).send({ error: 'ERR', message: error.message })
    })
    await app.register(adminRoutes, { prefix: '/admin' })
    await app.ready()
    adminAuth = { authorization: `Bearer ${app.jwt.sign({ sub: ADMIN })}` }
    userAuth = { authorization: `Bearer ${app.jwt.sign({ sub: B })}` }
  })

  /**
   * Cenário fixo (30 dias): atual = últimos 30 dias, anterior = 30–60 dias atrás.
   * ADMIN (100 dias), B (10 dias, ativo), C (40 dias: período anterior).
   */
  beforeEach(async () => {
    env.CREDIT_INVITES_ENABLED = true
    logs.length = 0
    await db.unsafe(
      'TRUNCATE credit_cancellations,credit_conversation_leases,credit_ledger,credit_welcome_claims,credit_invites,credit_operations,credit_wallets,profiles,auth.users,meals,diets,diet_jobs,streaks,ai_usage CASCADE',
    )
    await db`INSERT INTO auth.users(id,email,created_at) VALUES
      (${ADMIN},'dono@caloria.test',now()-interval '100 days'),
      (${B},'bruna.silva@exemplo.test',now()-interval '10 days'),
      (${C},'carlos@exemplo.test',now()-interval '40 days')`
    await db`INSERT INTO profiles(id,full_name,is_admin,weight_kg,created_at) VALUES
      (${ADMIN},'Dono',true,80,now()-interval '100 days'),
      (${B},'Bruna Silva',false,61,now()-interval '10 days'),
      (${C},'Carlos 50%',false,90,now()-interval '40 days')`
    await db`INSERT INTO meals(user_id,created_at) VALUES (${B},now()-interval '2 days'),(${C},now()-interval '35 days')`
    await db`INSERT INTO diets(user_id,status) VALUES (${B},'active')`
    await db`INSERT INTO diet_jobs(user_id,status,updated_at) VALUES (${B},'completed',now()-interval '4 days'),(${C},'failed',now()-interval '45 days')`
    await db`INSERT INTO streaks(user_id,current_streak) VALUES (${B},6)`
    await db`INSERT INTO ai_usage(user_id,feature,model,prompt_tokens,completion_tokens,total_tokens,created_at) VALUES
      (${B},'vision','openai/gpt-6.1-sol',1000,100,1100,now()-interval '5 days'),
      (${B},'chat','openai/gpt-6.1-sol',2000,200,2200,now()-interval '3 days'),
      (${B},'chat','openai/gpt-6.1-sol',2000,200,2200,now()-interval '3 days'),
      (${B},'transcribe','openai/whisper-1',1500,0,1500,now()-interval '3 days'),
      (${C},'chat','openai/gpt-6.1-sol',500,50,550,now()-interval '35 days'),
      (${B},'speech','acme/no-price',40,0,40,now()-interval '1 day')`
    await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES (${B},60),(${C},0)`
    await db`INSERT INTO credit_ledger(user_id,kind,units,created_at) VALUES (${B},'welcome',75,now()-interval '9 days')`
    const [op] =
      await db`INSERT INTO credit_operations(user_id,type,idempotency_key,payload_hash,cost_units,policy_version,state,fence,lease_expires_at,created_at)
        VALUES (${B},'photo','key-photo-0000000001','h',15,'v','succeeded',gen_random_uuid(),now(),now()-interval '5 days') RETURNING id`
    await db`INSERT INTO credit_ledger(user_id,operation_id,kind,units,created_at) VALUES (${B},${op.id},'debit',-15,now()-interval '5 days')`
  })

  afterAll(async () => {
    env.CREDIT_INVITES_ENABLED = oldInvites
    await app?.close()
    await db.end()
  })

  const get = (path: string, headers = adminAuth) =>
    app.inject({ method: 'GET', url: `/admin${path}`, headers })

  /** Convite usado por `user` (resgatado `claimedDaysAgo` dias atrás). */
  async function usedInvite(user: string, createdDaysAgo: number, claimedDaysAgo: number) {
    const [inv] = await db.unsafe(
      `INSERT INTO credit_invites(token_hash,creator_id,idempotency_key,label,status,claimed_by,expires_at,created_at)
       VALUES ($1,$2,$3,'Campanha',  'used',$4, now()+interval '7 days', now()-make_interval(days => $5)) RETURNING id`,
      [randomUUID(), ADMIN, randomUUID(), user, createdDaysAgo],
    )
    await db.unsafe(
      'INSERT INTO credit_welcome_claims(user_id,invite_id,created_at) VALUES ($1,$2,now()-make_interval(days => $3))',
      [user, inv.id, claimedDaysAgo],
    )
    await db.unsafe(
      `INSERT INTO credit_ledger(user_id,invite_id,actor_id,kind,units,created_at) VALUES ($1,$2,$1,'welcome',75,now()-make_interval(days => $3))`,
      [user, inv.id, claimedDaysAgo],
    )
    return String(inv.id)
  }

  describe('GET /admin/overview', () => {
    it('blocos do período e do período anterior batem com os dados', async () => {
      await usedInvite(C, 5, 3)
      await db`INSERT INTO credit_invites(token_hash,creator_id,idempotency_key,status,expires_at,created_at) VALUES
        (${randomUUID()},${ADMIN},${randomUUID()},'active',now()-interval '1 day',now()-interval '20 days'),
        (${randomUUID()},${ADMIN},${randomUUID()},'revoked',now()+interval '5 days',now()-interval '2 days')`
      const res = await get('/overview?days=30')
      expect(res.statusCode).toBe(200)
      const o = res.json()
      expect(o.periodDays).toBe(30)
      expect(o.users).toEqual({
        total: 3,
        newInPeriod: { value: 1, previous: 1 },
        active7d: 1,
        activeInPeriod: { value: 1, previous: 1 },
        withActiveDiet: 1,
      })
      expect(o.usage).toEqual({
        photos: { value: 1, previous: 0 },
        textMessages: { value: 1, previous: 1 },
        voiceMessages: { value: 1, previous: 0 },
        mealsLogged: { value: 1, previous: 1 },
        dietsCompleted: { value: 1, previous: 0 },
        dietsFailed: { value: 0, previous: 1 },
      })
      expect(o.credits).toEqual({
        welcomeAutoUnits: { value: 75, previous: 0 },
        welcomeInviteUnits: { value: 75, previous: 0 },
        consumedPhotoUnits: { value: 15, previous: 0 },
        consumedMessageUnits: { value: 0, previous: 0 },
        totalBalanceUnits: 60,
        zeroBalanceAccounts: 2,
      })
      expect(o.invites).toEqual({
        created: { value: 3, previous: 0 },
        redeemed: { value: 1, previous: 0 },
        redemptionRate: 0.33,
        expiredUnused: 1,
        revoked: 1,
      })
      const chat = o.ai.byFeature.find((f: { feature: string }) => f.feature === 'chat')
      expect(chat).toMatchObject({ calls: 2, totalTokens: 4400 })
      expect(chat.estimatedUsd).toBeCloseTo(2 * (2000 * 0.000002 + 200 * 0.00001), 9)
      const speech = o.ai.byFeature.find((f: { feature: string }) => f.feature === 'speech')
      expect(speech.estimatedUsd).toBeNull()
      const transcribe = o.ai.byFeature.find((f: { feature: string }) => f.feature === 'transcribe')
      expect(transcribe.estimatedUsd).toBeCloseTo(0.006, 9)
    })

    it('período fora de 7/30/90 → 400', async () => {
      expect((await get('/overview?days=15')).statusCode).toBe(400)
    })

    it('não-admin → 404 em todas as rotas', async () => {
      for (const path of ['/overview', '/users', '/credit-invites'])
        expect((await get(path, userAuth)).statusCode).toBe(404)
    })

    it('com os convites desligados, as métricas continuam respondendo', async () => {
      env.CREDIT_INVITES_ENABLED = false
      expect((await get('/overview')).statusCode).toBe(200)
      expect((await get('/users')).statusCode).toBe(200)
      expect((await get('/credit-invites')).statusCode).not.toBe(200)
    })
  })

  describe('GET /admin/users', () => {
    it('busca por pedaço do e-mail e do nome; % é literal', async () => {
      const byEmail = (await get('/users?q=bruna.s')).json()
      expect(byEmail.items.map((u: { id: string }) => u.id)).toEqual([B])
      const byName = (await get('/users?q=carl')).json()
      expect(byName.items.map((u: { id: string }) => u.id)).toEqual([C])
      const literal = (await get(`/users?q=${encodeURIComponent('50%')}`)).json()
      expect(literal.items.map((u: { id: string }) => u.id)).toEqual([C])
      const wildcard = (await get(`/users?q=${encodeURIComponent('%a')}`)).json()
      expect(wildcard.items).toEqual([])
    })

    it('linha com métricas de conta e sem dados de saúde', async () => {
      await usedInvite(C, 5, 3)
      const { items } = (await get('/users?sort=recent')).json()
      const b = items.find((u: { id: string }) => u.id === B)
      expect(b).toMatchObject({
        name: 'Bruna Silva',
        email: 'bruna.silva@exemplo.test',
        balance_units: 60,
        photos: 1,
        messages: 2,
        has_active_diet: true,
        current_streak: 6,
        joined_by_invite: false,
      })
      expect(b.last_activity_at).not.toBeNull()
      expect(items.find((u: { id: string }) => u.id === C).joined_by_invite).toBe(true)
      const admin = items.find((u: { id: string }) => u.id === ADMIN)
      expect(admin).toMatchObject({
        balance_units: 0,
        photos: 0,
        messages: 0,
        last_activity_at: null,
      })
      for (const key of ['weight_kg', 'height_cm', 'health_conditions', 'messages_history'])
        expect(Object.keys(b)).not.toContain(key)
    })

    it('ordenações', async () => {
      const ids = async (sort: string) =>
        (await get(`/users?sort=${sort}`)).json().items.map((u: { id: string }) => u.id)
      expect(await ids('recent')).toEqual([B, C, ADMIN])
      expect((await ids('active'))[0]).toBe(B)
      expect((await ids('active'))[2]).toBe(ADMIN)
      expect((await ids('low_balance'))[2]).toBe(B)
      expect((await ids('ai_usage'))[0]).toBe(B)
    })

    it('paginação de 25 não repete nem pula contas', async () => {
      const extra = Array.from({ length: 30 }, () => randomUUID())
      for (const id of extra) {
        await db`INSERT INTO auth.users(id,email) VALUES (${id},${`${id}@lote.test`})`
        await db`INSERT INTO profiles(id,full_name) VALUES (${id},'Lote')`
      }
      const first = (await get('/users?sort=recent')).json()
      expect(first.items).toHaveLength(25)
      expect(first.next_cursor).toBeTruthy()
      const second = (await get(`/users?sort=recent&cursor=${first.next_cursor}`)).json()
      expect(second.items).toHaveLength(8)
      expect(second.next_cursor).toBeNull()
      const all = [...first.items, ...second.items].map((u: { id: string }) => u.id)
      expect(new Set(all).size).toBe(33)
    })

    it('cursor inválido → 400; busca de 1 caractere → 400', async () => {
      expect((await get('/users?cursor=bad!')).statusCode).toBe(400)
      expect((await get('/users?cursor=eHl6')).statusCode).toBe(400)
      expect((await get('/users?q=a')).statusCode).toBe(400)
    })

    it('a busca fica registrada (admin, termo, quantidade) sem os resultados', async () => {
      await get('/users?q=bruna')
      const entry = logs.find((l) => (l as { msg?: string }).msg === 'admin_user_search') as {
        admin_user_search: Record<string, unknown>
      }
      expect(entry.admin_user_search).toEqual({ adminId: ADMIN, q: 'bruna', results: 1 })
    })
  })

  describe('GET /admin/credit-invites', () => {
    it('convite resgatado mostra quem, quando e o uso DEPOIS do resgate', async () => {
      const id = await usedInvite(B, 8, 6)
      const { items } = (await get('/credit-invites')).json()
      const inv = items.find((i: { id: string }) => i.id === id)
      expect(inv).toMatchObject({
        status: 'used',
        claimed_by: B,
        claimed_by_name: 'Bruna Silva',
        claimed_by_email: 'bruna.silva@exemplo.test',
        usage_since_claim: { debited_units: 15, photos: 1, messages: 0 },
      })
      expect(inv.claimed_at).toBeTruthy()
    })

    it('uso anterior ao resgate não conta', async () => {
      const id = await usedInvite(B, 2, 1)
      const inv = (await get('/credit-invites'))
        .json()
        .items.find((i: { id: string }) => i.id === id)
      expect(inv.usage_since_claim).toEqual({ debited_units: 0, photos: 0, messages: 0 })
    })

    it('filtro por status', async () => {
      await usedInvite(B, 8, 6)
      await db`INSERT INTO credit_invites(token_hash,creator_id,idempotency_key,status,expires_at) VALUES (${randomUUID()},${ADMIN},${randomUUID()},'revoked',now()+interval '1 day')`
      const used = (await get('/credit-invites?status=used')).json().items
      expect(used.map((i: { status: string }) => i.status)).toEqual(['used'])
      const revoked = (await get('/credit-invites?status=revoked')).json().items
      expect(revoked.map((i: { status: string }) => i.status)).toEqual(['revoked'])
    })

    it('conta excluída depois do resgate: sem nome, sem uso, sem quebrar', async () => {
      const id = await usedInvite(C, 5, 3)
      await db`DELETE FROM profiles WHERE id=${C}`
      await db`DELETE FROM auth.users WHERE id=${C}`
      const inv = (await get('/credit-invites'))
        .json()
        .items.find((i: { id: string }) => i.id === id)
      expect(inv).toMatchObject({
        status: 'used',
        claimed_by: null,
        claimed_by_name: null,
        claimed_by_email: null,
        claimed_at: null,
        usage_since_claim: { debited_units: 0, photos: 0, messages: 0 },
      })
    })
  })
})
