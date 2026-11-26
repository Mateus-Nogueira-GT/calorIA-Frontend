import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

/**
 * Harness de integração de social/desafios/streaks: só banco descartável local.
 * Opt-in por SOCIAL_TEST_DATABASE_URL (nome do banco com `social_test`). Cada
 * arquivo recria os schemas: rode os arquivos em série
 * (`vitest run --no-file-parallelism ...`). Não importa vitest.
 */
export const socialTestUrl = process.env.SOCIAL_TEST_DATABASE_URL

if (
  socialTestUrl &&
  (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(socialTestUrl).hostname) ||
    !new URL(socialTestUrl).pathname.includes('social_test'))
)
  throw new Error('Disposable localhost social_test database required')

export const SOCIAL_MIGRATIONS = [
  '004_challenges.sql',
  '007_social.sql',
  '010_notifications.sql',
  '014_spec_fixes.sql',
  '029_feed_counters_atomic.sql',
  '032_user_streak_lock.sql',
]

/** Cliente em UTC, como o Supabase (o initdb local herda o fuso da máquina). */
export function socialTestDb(): postgres.Sql {
  return postgres(socialTestUrl ?? 'postgres://localhost/unused', {
    max: 4,
    onnotice: () => {},
    connection: { TimeZone: 'UTC' },
  })
}

/** Recria public/auth com stubs mínimos e aplica as migrations reais do módulo. */
export async function resetSocialSchema(db: postgres.Sql, migrations = SOCIAL_MIGRATIONS) {
  const [name] = await db`SELECT current_database() AS name`
  if (!String(name.name).includes('social_test'))
    throw new Error('Database name must contain social_test; harness recreates schemas')
  await db.unsafe(`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;
    CREATE TABLE profiles(
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      is_admin boolean DEFAULT false, full_name text, avatar_url text, avatar_emoji text,
      weight_kg numeric, height_cm numeric, birth_date date, gender text, goal text,
      activity_level text, body_type text, coach_personality text, coach_gender text,
      dietary_restrictions text[] DEFAULT '{}', allergies text[] DEFAULT '{}',
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE diets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text);`)
  for (const migration of migrations)
    await db.unsafe(
      await readFile(new URL(`../../../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
    )
}

/** Cria usuário (auth + perfil; o trigger da 004 cria a linha de streaks). */
export async function createSocialUser(db: postgres.Sql, id: string, fullName: string) {
  await db`INSERT INTO auth.users(id) VALUES (${id})`
  await db`INSERT INTO profiles(id, full_name, username) VALUES (${id}, ${fullName}, ${fullName.toLowerCase()})`
}
