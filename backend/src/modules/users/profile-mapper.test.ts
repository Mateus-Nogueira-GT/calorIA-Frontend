import { describe, expect, it } from 'vitest'
import { toProfile } from './users.service.js'

/**
 * Regressão da rejeição da Apple (Guideline 2.1 — App Completeness).
 *
 * `weight_kg` é DECIMAL(5,2) e o postgres.js devolve DECIMAL como STRING. O
 * profileSchema declara z.number() e o Fastify valida a RESPOSTA: com a string,
 * a serialização falhava e a rota devolvia 500 "Ocorreu um erro inesperado".
 *
 * O UPDATE gravava antes de a resposta quebrar, então bastava informar o peso
 * uma vez para TODO GET /users/me daquela conta passar a dar 500 em definitivo.
 */

const linhaBase = {
  id: '11111111-1111-1111-1111-111111111111',
  username: 'teste',
  full_name: 'Teste',
  avatar_url: null,
  avatar_emoji: null,
  height_cm: 180,
  birth_date: null,
  gender: null,
  goal: null,
  activity_level: null,
  body_type: null,
  coach_personality: null,
  coach_gender: null,
  dietary_restrictions: null,
  allergies: null,
  current_streak: null,
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z',
} as unknown as Omit<Parameters<typeof toProfile>[0], 'weight_kg'>

describe('toProfile — weight_kg decimal vira número', () => {
  it('converte a string do DECIMAL em número', () => {
    const perfil = toProfile({ ...linhaBase, weight_kg: '105.00' })

    expect(perfil.weight_kg).toBe(105)
    expect(typeof perfil.weight_kg).toBe('number')
  })

  it('preserva null quando o peso não foi informado', () => {
    // Conta recém-criada: era o único caso que funcionava antes da correção.
    expect(toProfile({ ...linhaBase, weight_kg: null }).weight_kg).toBeNull()
  })

  it('aceita número já convertido sem estragar', () => {
    expect(toProfile({ ...linhaBase, weight_kg: 72.5 }).weight_kg).toBe(72.5)
  })

  it('mantém as casas decimais', () => {
    expect(toProfile({ ...linhaBase, weight_kg: '72.35' }).weight_kg).toBe(72.35)
  })

  it('não altera os demais campos', () => {
    const perfil = toProfile({ ...linhaBase, weight_kg: '80.00' })

    expect(perfil.height_cm).toBe(180)
    expect(perfil.username).toBe('teste')
    expect(perfil.id).toBe('11111111-1111-1111-1111-111111111111')
  })
})
