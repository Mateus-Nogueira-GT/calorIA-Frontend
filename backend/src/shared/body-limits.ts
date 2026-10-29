/**
 * Faixas plausíveis do corpo. Fora delas o valor é erro de digitação, não dado.
 * O app espelha em app/src/shared/utils/body-limits.ts (o cadastro inicial
 * já usava estas faixas; o servidor aceitava peso 0,1 kg e altura 1 cm).
 */
export const BODY_LIMITS = {
  weightKg: { min: 30, max: 300 },
  heightCm: { min: 100, max: 250 },
  age: { min: 13, max: 100 },
} as const

/** Idade completa em anos numa data YYYY-MM-DD válida; null se a data não existe. */
export function ageFromIsoDate(iso: string, now: Date = new Date()): number | null {
  const d = new Date(`${iso}T00:00:00Z`)
  // Date "corrige" 2000-02-31 para 02/03: a volta para texto denuncia a data inexistente.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const beforeBirthday =
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
  if (beforeBirthday) age--
  return age
}

export function isPlausibleBirthDate(iso: string, now: Date = new Date()): boolean {
  const age = ageFromIsoDate(iso, now)
  return age !== null && age >= BODY_LIMITS.age.min && age <= BODY_LIMITS.age.max
}
