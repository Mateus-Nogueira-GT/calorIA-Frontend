import { z } from 'zod'

/**
 * Datas locais do cliente (Workstream A da spec de auditoria).
 *
 * Convenção: o app envia sua data local como 'YYYY-MM-DD' e, quando precisa
 * converter timestamps, um `tzOffsetMinutes` tal que `local = UTC + offset`
 * (ex.: BRT = -180). No app isso é `-new Date().getTimezoneOffset()`.
 * Todos os parâmetros são OPCIONAIS nos endpoints — na ausência, o backend
 * mantém o comportamento UTC anterior (retrocompatibilidade).
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' do instante `now` em UTC. */
export function utcTodayString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Dia da semana em UTC: 1=Segunda … 7=Domingo. */
export function utcDayNumber(now: Date = new Date()): number {
  return ((now.getUTCDay() + 6) % 7) + 1
}

/**
 * Janela de sanidade da convenção global: entre hoje UTC − pastDays e
 * hoje UTC + futureDays (defaults 30/1). Também rejeita datas de calendário
 * inválidas (2026-02-30). Check-in de desafio usa {pastDays: 1} (A8).
 */
export function isWithinDateWindow(
  date: string,
  now: Date = new Date(),
  opts: { pastDays?: number; futureDays?: number } = {},
): boolean {
  const { pastDays = 30, futureDays = 1 } = opts
  if (!DATE_RE.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  // Rejeita overflow do Date (ex: 2026-02-30 → 2026-03-02)
  if (parsed.toISOString().slice(0, 10) !== date) return false

  const todayUtc = new Date(`${utcTodayString(now)}T00:00:00Z`).getTime()
  const DAY_MS = 86_400_000
  const min = todayUtc - pastDays * DAY_MS
  const max = todayUtc + futureDays * DAY_MS
  const t = parsed.getTime()
  return t >= min && t <= max
}

/**
 * Uma conclusão (`completedAt`, timestamptz) conta para o dia local `date`?
 * Aplica o offset do cliente e compara a data resultante.
 * É o que deriva o "reset" diário/semanal sem nenhum job: a refeição marcada
 * na semana passada simplesmente deixa de contar hoje.
 */
export function completedOnDate(
  completedAt: string | null,
  date: string,
  tzOffsetMinutes: number,
): boolean {
  if (!completedAt) return false
  // Postgres pode serializar como '2026-07-25 02:00:00+00' (sem o T e com
  // offset de 2 dígitos, que o Date do V8 não aceita) — normaliza os dois.
  const normalized = (
    completedAt.includes('T') ? completedAt : completedAt.replace(' ', 'T')
  ).replace(/([+-]\d{2})$/, '$1:00')
  const utcMs = new Date(normalized).getTime()
  if (Number.isNaN(utcMs)) return false
  const local = new Date(utcMs + tzOffsetMinutes * 60_000)
  return local.toISOString().slice(0, 10) === date
}

// ─── Schemas Zod reutilizáveis (query/body) ──────────────────────────────────

export const localDateSchema = z.string().regex(DATE_RE, 'Data deve estar no formato YYYY-MM-DD')

export const dayNumberSchema = z.coerce.number().int().min(1).max(7)

/** local = UTC + offset; limites de fusos reais (UTC−14 … UTC+12 → −840…+720). */
export const tzOffsetMinutesSchema = z.coerce.number().int().min(-840).max(720)
