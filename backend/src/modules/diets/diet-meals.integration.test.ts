import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createSocialUser,
  resetSocialSchema,
  socialTestDb,
  socialTestUrl,
} from '../../shared/testing/social-schema.js'
import { getTodayPlan, toggleMealCompleted } from './diets.service.js'

/**
 * Refeições do plano contra PostgreSQL REAL (lote 8): dia em que o cartão do
 * coach marca a refeição (R4). Usa o harness social (streaks, feed, a 014).
 * As tabelas de dieta são stubs com as colunas que o serviço lê (006_diets.sql).
 */
const TZ = -180 // BRT
const DAY_MS = 86_400_000

/** Data local (YYYY-MM-DD) no fuso do cliente, `days` dias a partir de hoje. */
const localDate = (days = 0) =>
  new Date(Date.now() + TZ * 60_000 + days * DAY_MS).toISOString().slice(0, 10)
/** 1 = segunda … 7 = domingo, como o app manda. */
const dayNumberOf = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
/** Data local de um timestamptz no fuso do cliente. */
const localDayOf = (at: Date | string) =>
  new Date(new Date(at).getTime() + TZ * 60_000).toISOString().slice(0, 10)
;(socialTestUrl ? describe : describe.skip)('refeições do plano / PostgreSQL real', () => {
  const db = socialTestDb()
  const fastify = {
    db,
    log: { warn: () => {}, info: () => {}, error: () => {} },
  } as unknown as FastifyInstance
  const user = randomUUID()
  /** day_number → id da refeição daquele dia. */
  const meals = new Map<number, string>()

  beforeAll(async () => {
    await resetSocialSchema(db)
    await db.unsafe(`
      ALTER TABLE diets ADD COLUMN user_id uuid, ADD COLUMN name text, ADD COLUMN description text,
        ADD COLUMN user_goal text, ADD COLUMN tdee_calories int, ADD COLUMN target_calories int,
        ADD COLUMN target_protein_g int, ADD COLUMN target_carbs_g int, ADD COLUMN target_fat_g int,
        ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();
      CREATE TABLE diet_days(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        diet_id uuid NOT NULL REFERENCES diets(id) ON DELETE CASCADE, day_number int NOT NULL,
        day_name text NOT NULL, total_calories numeric DEFAULT 0, total_protein numeric DEFAULT 0,
        total_carbs numeric DEFAULT 0, total_fat numeric DEFAULT 0, UNIQUE (diet_id, day_number));
      CREATE TABLE diet_meals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        diet_day_id uuid NOT NULL REFERENCES diet_days(id) ON DELETE CASCADE, meal_type text NOT NULL,
        name text NOT NULL, time_suggestion text, total_calories numeric DEFAULT 0,
        total_protein numeric DEFAULT 0, total_carbs numeric DEFAULT 0, total_fat numeric DEFAULT 0,
        is_completed boolean DEFAULT false, completed_at timestamptz, sort_order int DEFAULT 0);
      CREATE TABLE diet_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        diet_meal_id uuid NOT NULL REFERENCES diet_meals(id) ON DELETE CASCADE, food_name text NOT NULL,
        quantity_g numeric NOT NULL, unit text NOT NULL DEFAULT 'g', calories numeric NOT NULL,
        is_substitution boolean DEFAULT false, sort_order int DEFAULT 0);`)
    await createSocialUser(db, user, 'Dora')
    const [diet] = await db<{ id: string }[]>`
      INSERT INTO diets(id, user_id, status) VALUES (gen_random_uuid(), ${user}, 'active') RETURNING id`
    for (let day = 1; day <= 7; day++) {
      const [d] = await db<{ id: string }[]>`
        INSERT INTO diet_days(diet_id, day_number, day_name) VALUES (${diet.id}, ${day}, ${`Dia ${day}`})
        RETURNING id`
      const [m] = await db<{ id: string }[]>`
        INSERT INTO diet_meals(diet_day_id, meal_type, name, total_calories)
        VALUES (${d.id}, 'lunch', 'Almoço', 600) RETURNING id`
      meals.set(day, m.id)
    }
  })
  beforeEach(async () => {
    await db`UPDATE diet_meals SET is_completed = false, completed_at = NULL`
    await db`UPDATE streaks SET current_streak = 0, best_streak = 0, last_active_date = NULL`
    await db`TRUNCATE feed_posts CASCADE`
  })
  afterAll(async () => {
    await db.end()
  })

  const mealOf = (date: string) => meals.get(dayNumberOf(date)) as string
  const completedAt = async (date: string) =>
    (
      await db<{ completed_at: Date | null }[]>`
        SELECT completed_at FROM diet_meals WHERE id = ${mealOf(date)}`
    )[0].completed_at
  const planOf = (date: string) =>
    getTodayPlan(fastify, user, { dayNumber: dayNumberOf(date), date, tzOffsetMinutes: TZ })

  describe('R4: dia em que o cartão marca a refeição', () => {
    it('cartão de ontem tocado hoje: completed_at cai em ontem e o plano de ontem mostra feita', async () => {
      const yesterday = localDate(-1)
      await expect(
        toggleMealCompleted(fastify, user, mealOf(yesterday), yesterday, TZ, true),
      ).resolves.toEqual({ is_completed: true })
      const at = await completedAt(yesterday)
      expect(at && localDayOf(at)).toBe(yesterday)
      expect((await planOf(yesterday))?.meals[0].completedToday).toBe(true)
      // A sequência conta o dia proposto.
      const [s] = await db`SELECT last_active_date::TEXT AS d FROM streaks WHERE user_id = ${user}`
      expect(s.d).toBe(yesterday)
    })

    it('hoje continua igual: completed_at é o instante do toque', async () => {
      const today = localDate()
      const before = Date.now()
      await toggleMealCompleted(fastify, user, mealOf(today), today, TZ, true)
      const at = await completedAt(today)
      expect(at).not.toBeNull()
      expect(Math.abs(new Date(at as Date).getTime() - before)).toBeLessThan(60_000)
      expect((await planOf(today))?.meals[0].completedToday).toBe(true)
    })

    it.each([
      ['amanhã', 1],
      ['anteontem', -2],
    ])('data fora do que o cartão carrega (%s) é recusada sem marcar', async (_label, days) => {
      const date = localDate(days)
      await expect(
        toggleMealCompleted(fastify, user, mealOf(date), date, TZ, true),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DATE' })
      expect(await completedAt(date)).toBeNull()
    })
  })
})
