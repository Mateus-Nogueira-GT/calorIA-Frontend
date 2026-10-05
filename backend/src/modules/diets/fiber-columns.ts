import type { FastifyInstance } from 'fastify'

/**
 * As migrations rodam à mão no SQL Editor do Supabase — o deploy pode chegar
 * antes da 020. Sem as colunas, a dieta é gravada como antes (sem fibra).
 * Só o "sim" fica em cache: depois que a migration roda, não volta a sumir.
 */
let known = false

export async function hasFiberColumns(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'diet_items' AND column_name = 'fiber_g')
        OR (table_name IN ('diet_meals', 'diet_days') AND column_name = 'total_fiber'))
  `
  known = (rows[0]?.n ?? 0) === 3
  return known
}

/** Só para testes. */
export function __resetFiberColumnsCache(): void {
  known = false
}
