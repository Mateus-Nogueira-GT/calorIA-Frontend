import type { FastifyInstance } from 'fastify'

/**
 * Mesmo padrão de meal-fiber-columns.ts: a migration 025 roda à mão no SQL
 * Editor do Supabase e o deploy pode chegar antes. Sem as colunas, o registro
 * do scanner é gravado como antes, sem a dúvida. Só o "sim" fica em cache.
 */
let known = false

export async function hasMealScanColumns(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meal_items'
      AND column_name IN ('ai_confidence', 'ai_alternatives')
  `
  known = (rows[0]?.n ?? 0) === 2
  return known
}

/** Só para testes. */
export function __resetMealScanColumnsCache(): void {
  known = false
}
