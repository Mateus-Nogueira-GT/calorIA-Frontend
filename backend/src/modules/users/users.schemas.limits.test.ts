import { describe, expect, it } from 'vitest'
import { addWeightBodySchema } from '../weight/weight.schemas.js'
import { updateProfileBodySchema } from './users.schemas.js'

const yearsAgo = (n: number) => {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}

describe('faixas plausíveis do corpo (sem dado impossível)', () => {
  it('peso do perfil: 30 a 300 kg', () => {
    expect(updateProfileBodySchema.safeParse({ weight_kg: 30 }).success).toBe(true)
    expect(updateProfileBodySchema.safeParse({ weight_kg: 300 }).success).toBe(true)
    expect(updateProfileBodySchema.safeParse({ weight_kg: 0.1 }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ weight_kg: 301 }).success).toBe(false)
  })

  it('altura: 100 a 250 cm', () => {
    expect(updateProfileBodySchema.safeParse({ height_cm: 100 }).success).toBe(true)
    expect(updateProfileBodySchema.safeParse({ height_cm: 1 }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ height_cm: 251 }).success).toBe(false)
  })

  it('nascimento: idade de 13 a 100 anos, nunca no futuro', () => {
    expect(updateProfileBodySchema.safeParse({ birth_date: yearsAgo(30) }).success).toBe(true)
    expect(updateProfileBodySchema.safeParse({ birth_date: '1800-01-01' }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ birth_date: '2030-01-01' }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ birth_date: yearsAgo(5) }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ birth_date: '2000-02-31' }).success).toBe(false)
  })

  it('o cadastro inicial manda 1º de janeiro do ano da idade: 13 e 100 anos passam', () => {
    const y = new Date().getUTCFullYear()
    expect(updateProfileBodySchema.safeParse({ birth_date: `${y - 13}-01-01` }).success).toBe(true)
    expect(updateProfileBodySchema.safeParse({ birth_date: `${y - 100}-01-01` }).success).toBe(true)
  })

  it('registro de peso: 30 a 300 kg', () => {
    const date = '2026-10-28'
    expect(addWeightBodySchema.safeParse({ weightKg: 80.5, date }).success).toBe(true)
    expect(addWeightBodySchema.safeParse({ weightKg: 0.5, date }).success).toBe(false)
    expect(addWeightBodySchema.safeParse({ weightKg: 450, date }).success).toBe(false)
  })
})
