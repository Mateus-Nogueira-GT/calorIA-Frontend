import type { FastifyInstance } from 'fastify'

/**
 * Mesmo padrão de diets/fiber-columns.ts: as migrations rodam à mão no SQL
 * Editor do Supabase e o deploy pode chegar antes da 022. Sem as colunas, o
 * diário grava como antes (sem fibra). Só o "sim" fica em cache.
 */
let known = false

export async function hasMealFiberColumns(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'meal_items' AND column_name = 'fiber_g')
        OR (table_name = 'meals' AND column_name = 'total_fiber'))
  `
  known = (rows[0]?.n ?? 0) === 2
  return known
}

/** Só para testes. */
export function __resetMealFiberColumnsCache(): void {
  known = false
}
