import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { CollectedUserData } from '../../shared/diet-ai-schema.js'
import { createDietJob, retryJob } from './jobs.service.js'

/**
 * R7 (26/11): um job de geração ativo por usuário, contra PostgreSQL REAL.
 * Recria os schemas: só em banco descartável local cujo nome contém
 * credits_test (mesmo opt-in dos outros harnesses de TEST_DATABASE_URL; rode
 * em série com `--no-file-parallelism`).
 */
const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')

const migration = (name: string) =>
  readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')

const dados = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'maintain',
  activity_level: 'moderate',
  meals_per_day: 3,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'ok',
  health_conditions: [],
} as CollectedUserData
;(url ? describe : describe.skip)('diet_jobs / real PostgreSQL (R7)', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 8, onnotice: () => {} })
  const fastify = {
    db,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyInstance

  async function reset() {
    await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
      CREATE TABLE diets(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, conversation_id uuid,
        name text, description text, user_weight_kg numeric, user_height_cm int, user_age int,
        user_gender text, user_goal text, user_activity_level text, tdee_calories int,
        target_calories int, target_protein_g int, target_carbs_g int, target_fat_g int,
        status text NOT NULL CHECK (status IN ('active','archived','replaced','draft','failed')),
        ai_model text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`)
    for (const name of ['012_diet_jobs.sql', '017_diet_jobs_step_lock.sql'])
      await db.unsafe(await migration(name))
  }

  async function user(): Promise<string> {
    const id = randomUUID()
    await db`INSERT INTO auth.users(id) VALUES (${id})`
    await db`INSERT INTO profiles(id) VALUES (${id})`
    return id
  }

  async function job(userId: string, status: string, minutesAgo: number) {
    const [diet] = await db`
      INSERT INTO diets(user_id, status) VALUES (${userId}, ${status === 'completed' ? 'active' : 'draft'})
      RETURNING id`
    const [row] = await db`
      INSERT INTO diet_jobs(user_id, diet_id, status, input, created_at, updated_at, step_token)
      VALUES (${userId}, ${diet.id}, ${status}, '{}'::jsonb,
              NOW() - make_interval(mins => ${minutesAgo}), NOW(), gen_random_uuid())
      RETURNING id`
    return { jobId: row.id as string, dietId: diet.id as string }
  }

  /** A 031 tem BEGIN/COMMIT próprios: o postgres.js exige uma conexão reservada. */
  async function apply031() {
    const conn = await db.reserve()
    try {
      await conn.unsafe(await migration('031_diet_jobs_one_running.sql'))
    } finally {
      conn.release()
    }
  }

  const jobsOf = (userId: string) => db`
    SELECT j.id, j.status, j.error, j.step_token, d.status AS diet_status
    FROM diet_jobs j JOIN diets d ON d.id = j.diet_id
    WHERE j.user_id = ${userId} ORDER BY j.created_at`

  beforeAll(async () => {
    const [name] = await db`SELECT current_database() AS name`
    if (!String(name.name).includes('credits_test'))
      throw new Error('Database name must contain credits_test; harness recreates schemas')
  })
  afterAll(async () => {
    await db.end()
  })

  describe('migration 031 sobre dados que já têm duplicados', () => {
    beforeEach(reset)

    it('fecha os ativos duplicados (fica o mais recente) e cria o índice', async () => {
      const a = await user()
      const b = await user()
      const c = await user()
      const oldest = await job(a, 'pending', 30)
      const middle = await job(a, 'running', 20)
      const newest = await job(a, 'running', 10)
      const onlyB = await job(b, 'running', 5)
      await job(c, 'completed', 50)
      await job(c, 'failed', 40)
      await job(c, 'pending', 1)

      await apply031()

      const rowsA = await jobsOf(a)
      expect(rowsA.filter((r) => ['pending', 'running'].includes(r.status))).toHaveLength(1)
      expect(rowsA.find((r) => r.id === newest.jobId)?.status).toBe('running')
      for (const closed of [oldest, middle]) {
        const row = rowsA.find((r) => r.id === closed.jobId)
        expect(row).toMatchObject({ status: 'failed', step_token: null, diet_status: 'failed' })
        expect(row?.error).toMatch(/^DUPLICATE_ACTIVE_JOB/)
      }
      expect((await jobsOf(b)).map((r) => [r.id, r.status])).toEqual([[onlyB.jobId, 'running']])
      expect((await jobsOf(c)).map((r) => r.status)).toEqual(['completed', 'failed', 'pending'])

      // O índice passa a barrar um segundo ativo...
      await expect(job(b, 'pending', 0)).rejects.toMatchObject({
        code: '23505',
        constraint_name: 'diet_jobs_one_active_per_user',
      })
      // ...e rodar de novo não falha nem mexe em nada.
      await apply031()
      expect(
        (await jobsOf(a)).filter((r) => ['pending', 'running'].includes(r.status)),
      ).toHaveLength(1)
    })
  })

  describe('com a 031 aplicada', () => {
    beforeEach(async () => {
      await reset()
      await apply031()
    })

    it('createDietJob simultâneos do mesmo usuário resultam num job só', async () => {
      const u = await user()
      const results = await Promise.all(
        Array.from({ length: 6 }, () => createDietJob(fastify, u, randomUUID(), dados)),
      )
      const rows = await jobsOf(u)
      expect(rows).toHaveLength(1)
      expect(results.every((r) => r.jobId === rows[0].id)).toBe(true)
      // A transação de quem perdeu desfaz a draft dela: nenhuma dieta órfã.
      const diets = await db`SELECT id FROM diets WHERE user_id = ${u}`
      expect(diets).toHaveLength(1)
    })

    it('perdedor determinístico: o insert espera o vencedor e devolve o job dele', async () => {
      // O vencedor insere e segura o commit: a checagem do createDietJob não o
      // vê, o insert do perdedor bloqueia no índice e recebe 23505 no commit.
      const u = await user()
      let release!: () => void
      const gate = new Promise<void>((r) => {
        release = r
      })
      let inserted!: () => void
      const ready = new Promise<void>((r) => {
        inserted = r
      })
      const winner = db.begin(async (tx) => {
        const [diet] =
          await tx`INSERT INTO diets(user_id, status) VALUES (${u}, 'draft') RETURNING id`
        const [row] = await tx`
          INSERT INTO diet_jobs(user_id, diet_id, status, input)
          VALUES (${u}, ${diet.id}, 'pending', '{}'::jsonb) RETURNING id`
        inserted()
        await gate
        return { jobId: row.id as string, dietId: diet.id as string }
      })
      await ready
      const loser = createDietJob(fastify, u, randomUUID(), dados)
      await new Promise((r) => setTimeout(r, 300))
      release()
      const won = await winner
      expect(await loser).toEqual(won)
      expect(await db`SELECT id FROM diets WHERE user_id = ${u}`).toHaveLength(1)
    })

    it('retryJob com outro job ativo devolve o estado real em vez de 500', async () => {
      const u = await user()
      const failed = await job(u, 'failed', 30)
      await job(u, 'running', 1)
      const r = await retryJob(fastify, u, failed.jobId)
      expect(r.status).toBe('failed')
      expect((await jobsOf(u)).map((row) => row.status)).toEqual(['failed', 'running'])
    })
  })
})
