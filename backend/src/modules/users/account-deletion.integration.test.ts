import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Exclusão de conta (26/11/2026). O Supabase Auth apaga a linha de auth.users
 * com o papel `supabase_auth_admin`, que não tem permissão nas tabelas de
 * public. A cascata (auth.users → meals → meal_items; → post_likes/comments)
 * dispara triggers que fazem UPDATE em public.meals/feed_posts. Como as
 * funções eram SECURITY INVOKER, o UPDATE rodava com o papel do Auth e caía
 * em "permission denied": o deleteUser devolvia "Database error deleting user"
 * e a conta de quem tinha refeição, curtida ou comentário não era excluída.
 *
 * Opt-in, só banco descartável local (nome com deletion_test).
 */
const url = process.env.DELETION_TEST_DATABASE_URL
if (
  url &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) ||
    !new URL(url).pathname.includes('deletion_test'))
)
  throw new Error('Disposable localhost deletion_test database required')

const MIGRATIONS = [
  '001_profiles.sql',
  '002_foods.sql',
  '003_meals.sql',
  '022_meal_fiber.sql',
  '007_social.sql',
  '029_feed_counters_atomic.sql',
  '033_trigger_functions_security_definer.sql',
]
;(url ? describe : describe.skip)('exclusão de conta / PostgreSQL real', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 1, onnotice: () => {} })

  beforeAll(async () => {
    await db.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
      CREATE SCHEMA public; CREATE SCHEMA auth;
      -- Como o schema public padrão: USAGE para todos (sem permissão nas tabelas).
      GRANT USAGE ON SCHEMA public TO PUBLIC;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
          CREATE ROLE supabase_auth_admin NOINHERIT;
        END IF;
      END $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';`)
    for (const migration of MIGRATIONS)
      await db.unsafe(
        await readFile(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
    // Como no Supabase: auth.users pertence ao papel do Auth, sem grants em public.
    await db.unsafe(`ALTER TABLE auth.users OWNER TO supabase_auth_admin;
      GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;`)
  })
  afterAll(async () => {
    await db.end()
  })

  /** DELETE de auth.users com o papel do Supabase Auth, como o admin.deleteUser. */
  async function deleteAsAuth(id: string) {
    await db.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE supabase_auth_admin')
      await tx`DELETE FROM auth.users WHERE id = ${id}`
    })
  }

  it('conta com refeição e itens é excluída (cascata em meals/meal_items)', async () => {
    const user = randomUUID()
    const meal = randomUUID()
    await db`INSERT INTO auth.users(id, email) VALUES (${user}, ${`${user}@x.test`})`
    await db`INSERT INTO meals(id, user_id, meal_type, meal_date) VALUES (${meal}, ${user}, 'lunch', CURRENT_DATE)`
    await db`INSERT INTO meal_items(meal_id, food_name, quantity_g, calories, protein_g, carbs_g, fat_g)
      VALUES (${meal}, 'Arroz', 100, 130, 2.5, 28, 0.3)`

    await deleteAsAuth(user)

    expect(await db`SELECT 1 FROM meals WHERE user_id = ${user}`).toHaveLength(0)
    expect(await db`SELECT 1 FROM auth.users WHERE id = ${user}`).toHaveLength(0)
  })

  it('conta que curtiu e comentou post de outra pessoa é excluída e os contadores descem', async () => {
    const author = randomUUID()
    const leaving = randomUUID()
    const post = randomUUID()
    await db`INSERT INTO auth.users(id, email) VALUES (${author}, ${`${author}@x.test`}), (${leaving}, ${`${leaving}@x.test`})`
    await db`INSERT INTO feed_posts(id, user_id, type, content) VALUES (${post}, ${author}, 'custom', 'oi')`
    await db`INSERT INTO post_likes(post_id, user_id) VALUES (${post}, ${leaving})`
    await db`INSERT INTO post_comments(post_id, user_id, content) VALUES (${post}, ${leaving}, 'boa')`
    const [before] = await db`SELECT likes_count, comments_count FROM feed_posts WHERE id = ${post}`
    expect(before).toEqual({ likes_count: 1, comments_count: 1 })

    await deleteAsAuth(leaving)

    const [after] = await db`SELECT likes_count, comments_count FROM feed_posts WHERE id = ${post}`
    expect(after).toEqual({ likes_count: 0, comments_count: 0 })
    expect(await db`SELECT 1 FROM auth.users WHERE id = ${leaving}`).toHaveLength(0)
  })

  it('as funções dos triggers são SECURITY DEFINER com search_path fixo', async () => {
    const rows = await db<{ proname: string; prosecdef: boolean; proconfig: string[] | null }[]>`
      SELECT proname, prosecdef, proconfig FROM pg_proc
      WHERE proname IN ('recalculate_meal_totals', 'recalculate_post_likes', 'recalculate_post_comments')
      ORDER BY proname`
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.prosecdef).toBe(true)
      expect(row.proconfig?.some((c) => c.startsWith('search_path='))).toBe(true)
    }
  })
})
