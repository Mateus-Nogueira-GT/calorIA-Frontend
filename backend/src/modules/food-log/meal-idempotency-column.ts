import type { FastifyInstance } from 'fastify'

/**
 * Mesmo padrão de meal-fiber-columns.ts: a migration 030 roda à mão no SQL
 * Editor do Supabase e o deploy pode chegar antes. Sem a coluna, o POST com
 * Idempotency-Key grava como antes (sem deduplicar). Só o "sim" fica em cache.
 */
let known = false

export async function hasMealIdempotencyColumn(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ present: boolean }[]>`
    SELECT COUNT(*) = 1 AS present FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals'
      AND column_name = 'idempotency_key'
  `
  known = rows[0]?.present === true
  return known
}

/** Só para testes. */
export function __resetMealIdempotencyColumnCache(): void {
  known = false
}
