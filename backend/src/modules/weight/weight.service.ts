import type { FastifyInstance } from 'fastify'
import type { AddWeightBody, WeightEntry } from './weight.schemas.js'

interface DbRow {
  id: string
  date: string
  weight_kg: string
}

function toEntry(row: DbRow): WeightEntry {
  return { id: row.id, date: row.date, weightKg: Number(row.weight_kg) }
}

export async function getHistory(fastify: FastifyInstance, userId: string): Promise<WeightEntry[]> {
  const rows = await fastify.db<DbRow[]>`
    SELECT id, date::TEXT AS date, weight_kg
    FROM weight_entries
    WHERE user_id = ${userId}
    ORDER BY date ASC
  `
  return rows.map(toEntry)
}

/** Upsert: 1 registro por dia — reenviar a mesma data atualiza o peso. */
export async function upsertEntry(
  fastify: FastifyInstance,
  userId: string,
  data: AddWeightBody,
): Promise<WeightEntry> {
  const [row] = await fastify.db<DbRow[]>`
    INSERT INTO weight_entries (user_id, date, weight_kg)
    VALUES (${userId}, ${data.date}, ${data.weightKg})
    ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = ${data.weightKg}
    RETURNING id, date::TEXT AS date, weight_kg
  `
  return toEntry(row)
}
