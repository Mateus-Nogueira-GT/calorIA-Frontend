import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMealBodySchema } from './food-log.schemas.js'
import { addMeal, listMeals, updateMeal } from './food-log.service.js'
import { __resetMealFiberColumnsCache } from './meal-fiber-columns.js'
import { __resetMealIdempotencyColumnCache } from './meal-idempotency-column.js'

// Opt-in, só banco descartável local. Não usa DATABASE_URL de produção.
const url = process.env.SCANNER_TEST_DATABASE_URL
if (
  url &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.includes('scanner_test'))
)
  throw new Error('Disposable localhost scanner_test database required')
;(url ? describe : describe.skip)('porções / PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 1, onnotice: () => {} })
  const fastify = { db } as unknown as FastifyInstance
  // Pool com mais de uma conexão: com max 1 as requisições "simultâneas" viram fila.
  const pool = postgres(url ?? 'postgres://localhost/unused', { max: 4, onnotice: () => {} })
  const concurrent = { db: pool } as unknown as FastifyInstance
  const user = randomUUID()
  const other = randomUUID()

  beforeAll(async () => {
    await db.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE TABLE foods(id uuid PRIMARY KEY);
      CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;`)
    for (const migration of [
      '003_meals.sql',
      '022_meal_fiber.sql',
      '030_food_log_idempotency.sql',
    ]) {
      await db.unsafe(
        await readFile(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
    }
    await db`INSERT INTO auth.users(id) VALUES (${user}), (${other})`
    __resetMealFiberColumnsCache()
    __resetMealIdempotencyColumnCache()
  })
  afterAll(async () => {
    __resetMealFiberColumnsCache()
    __resetMealIdempotencyColumnCache()
    await pool.end()
    await db.end()
  })

  it('persiste gramas, mantém nutrientes por porção e preserva peso em PATCH legado', async () => {
    const payload = addMealBodySchema.parse({
      name: 'Arroz',
      weightGrams: 150.5,
      calories: 195.7,
      protein: 4,
      carbs: 42,
      fat: 1,
      fiber: 2,
      mealType: 'lunch',
    })
    const meal = await addMeal(fastify, user, payload)
    const [saved] =
      await db`SELECT quantity_g, calories, protein_g, carbs_g, fiber_g FROM meal_items WHERE meal_id = ${meal.id}`
    expect(Number(saved.quantity_g)).toBe(150.5)
    expect(Number(saved.calories)).toBe(195.7)
    expect(Number(saved.protein_g)).toBe(4)
    expect(Number(saved.carbs_g)).toBe(42)
    expect(Number(saved.fiber_g)).toBe(2)

    const { weightGrams: _weight, ...legacyPatch } = payload
    await updateMeal(fastify, user, meal.id, { ...legacyPatch, calories: 200 })
    const [edited] =
      await db`SELECT quantity_g, calories FROM meal_items WHERE meal_id = ${meal.id}`
    expect(Number(edited.quantity_g)).toBe(150.5)
    expect(Number(edited.calories)).toBe(200)
    const [day] = await db`SELECT CURRENT_DATE::text AS date`
    const meals = await listMeals(fastify, user, String(day.date))
    expect(meals.find((item) => item.id === meal.id)?.calories).toBe(200)
    expect(await listMeals(fastify, other, String(day.date))).toEqual([])
    await expect(updateMeal(fastify, other, meal.id, legacyPatch)).rejects.toMatchObject({
      code: 'MEAL_NOT_FOUND',
    })
  })

  it('cliente sem peso mantém compatibilidade de gravação', async () => {
    const meal = await addMeal(
      fastify,
      user,
      addMealBodySchema.parse({ name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0 }),
    )
    const [saved] = await db`SELECT quantity_g FROM meal_items WHERE meal_id = ${meal.id}`
    expect(Number(saved.quantity_g)).toBe(100)
  })

  describe('Idempotency-Key (C4)', () => {
    const almoco = addMealBodySchema.parse({
      name: 'Feijoada',
      weightGrams: 300,
      calories: 520,
      protein: 30,
      carbs: 40,
      fat: 25,
      fiber: 8,
      mealType: 'lunch',
      date: '2026-11-26',
    })
    const count = async (userId: string, name: string) => {
      const [row] =
        await db`SELECT COUNT(*)::int AS n FROM meals WHERE user_id = ${userId} AND name = ${name}`
      return row.n as number
    }

    it('duas requisições simultâneas com a mesma chave gravam uma refeição só', async () => {
      const key = `key-${randomUUID()}`
      const [a, b, c] = await Promise.all([
        addMeal(concurrent, user, almoco, key),
        addMeal(concurrent, user, almoco, key),
        addMeal(concurrent, user, almoco, key),
      ])
      expect(await count(user, 'Feijoada')).toBe(1)
      expect(b).toEqual(a)
      expect(c).toEqual(a)
      expect(a).toMatchObject({ calories: 520, fiber: 8, mealType: 'lunch' })
      const [items] = await db`SELECT COUNT(*)::int AS n FROM meal_items WHERE meal_id = ${a.id}`
      expect(items.n).toBe(1)
    })

    it('repetir a chave depois devolve a mesma refeição, com o mesmo corpo', async () => {
      const key = `key-${randomUUID()}`
      const first = await addMeal(fastify, user, { ...almoco, name: 'Repetida' }, key)
      const again = await addMeal(fastify, user, { ...almoco, name: 'Repetida' }, key)
      expect(again).toEqual(first)
      expect(await count(user, 'Repetida')).toBe(1)
    })

    it('a mesma chave de outro usuário é outra refeição', async () => {
      const key = `key-${randomUUID()}`
      await addMeal(fastify, user, { ...almoco, name: 'Compartilhada' }, key)
      await addMeal(fastify, other, { ...almoco, name: 'Compartilhada' }, key)
      expect(await count(user, 'Compartilhada')).toBe(1)
      expect(await count(other, 'Compartilhada')).toBe(1)
    })

    it('sem chave mantém o comportamento de hoje: cada envio é um registro', async () => {
      await addMeal(fastify, user, { ...almoco, name: 'Sem chave' })
      await addMeal(fastify, user, { ...almoco, name: 'Sem chave' })
      expect(await count(user, 'Sem chave')).toBe(2)
    })
  })
})
