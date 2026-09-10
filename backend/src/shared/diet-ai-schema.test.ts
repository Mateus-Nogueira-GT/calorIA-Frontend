import { describe, expect, it } from 'vitest'
import { COLLECTED_BOUNDS, collectedUserDataSchema } from './diet-ai-schema.js'

const valido = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'maintain',
  activity_level: 'moderate',
  meals_per_day: 4,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'ok',
  health_conditions: [],
}

describe('collectedUserDataSchema — bounds de plausibilidade (S1)', () => {
  it('aceita um perfil comum', () => {
    expect(collectedUserDataSchema.safeParse(valido).success).toBe(true)
  })

  it.each([
    ['weight_kg', 29.9],
    ['weight_kg', 300.1],
    ['height_cm', 119],
    ['height_cm', 251],
    ['age', 9],
    ['age', 101],
    ['meals_per_day', 2],
    ['meals_per_day', 7],
  ])('rejeita %s = %s', (campo, valor) => {
    const r = collectedUserDataSchema.safeParse({ ...valido, [campo]: valor })
    expect(r.success).toBe(false)
  })

  it('aceita as bordas inclusivas', () => {
    expect(collectedUserDataSchema.safeParse({ ...valido, weight_kg: 30 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, weight_kg: 300 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 120 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 250 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, age: 10 }).success).toBe(true)
    expect(collectedUserDataSchema.safeParse({ ...valido, age: 100 }).success).toBe(true)
  })

  it('altura em metros (1.75) é rejeitada — o servidor pede confirmação em vez de calcular BMR absurdo', () => {
    expect(collectedUserDataSchema.safeParse({ ...valido, height_cm: 1.75 }).success).toBe(false)
  })

  it('listas: até 10 itens de até 40 chars; preferências até 300 chars', () => {
    const onze = Array.from({ length: 11 }, (_, i) => `item${i}`)
    expect(collectedUserDataSchema.safeParse({ ...valido, allergies: onze }).success).toBe(false)
    expect(
      collectedUserDataSchema.safeParse({ ...valido, allergies: ['a'.repeat(41)] }).success,
    ).toBe(false)
    expect(
      collectedUserDataSchema.safeParse({ ...valido, food_preferences: 'x'.repeat(301) }).success,
    ).toBe(false)
    expect(collectedUserDataSchema.safeParse({ ...valido, health_conditions: onze }).success).toBe(
      false,
    )
  })

  it('health_conditions ausente vira [] (jobs gravados antes desta versão)', () => {
    const { health_conditions: _omit, ...semCampo } = valido
    const r = collectedUserDataSchema.safeParse(semCampo)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.health_conditions).toEqual([])
  })

  it('exporta os bounds para reuso (prompt, mensagens de erro)', () => {
    expect(COLLECTED_BOUNDS.weightKg).toEqual([30, 300])
    expect(COLLECTED_BOUNDS.heightCm).toEqual([120, 250])
    expect(COLLECTED_BOUNDS.age).toEqual([10, 100])
  })
})
