import { describe, it, expect } from 'vitest'
import { computeTargets, parseInput } from './jobs.service.js'
import type { CollectedUserData } from '../../shared/diet-ai-schema.js'

const base: CollectedUserData = {
  weight_kg: 80,
  height_cm: 180,
  age: 30,
  gender: 'male',
  goal: 'gain_muscle',
  activity_level: 'moderate',
  meals_per_day: 5,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'ok',
}

describe('computeTargets (Mifflin-St Jeor)', () => {
  it('homem 80kg/180cm/30a moderado ganhando massa: TDEE ~2762, alvo ~3062', () => {
    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780; TDEE = 1780*1.55 = 2759
    const t = computeTargets(base)
    expect(t.tdee).toBe(2759)
    expect(t.targetCalories).toBe(3059)
  })

  it('mulher usa -161 no BMR', () => {
    const t = computeTargets({ ...base, gender: 'female' })
    // BMR = 1780 - 5 - 161 = 1614; TDEE = 1614*1.55 = 2501.7 -> 2502
    expect(t.tdee).toBe(2502)
  })

  it('perda de peso subtrai 500 kcal do TDEE', () => {
    const t = computeTargets({ ...base, goal: 'lose_weight' })
    expect(t.targetCalories).toBe(2259)
  })

  it('proteína: 2.0 g/kg pra ganho de massa, 1.8 g/kg nos demais', () => {
    expect(computeTargets(base).protein).toBe(160)
    expect(computeTargets({ ...base, goal: 'maintain' }).protein).toBe(144)
  })

  it('nunca retorna alvo abaixo de 1000 kcal', () => {
    const t = computeTargets({
      ...base,
      weight_kg: 35,
      height_cm: 140,
      age: 80,
      gender: 'female',
      activity_level: 'sedentary',
      goal: 'lose_weight',
    })
    expect(t.targetCalories).toBeGreaterThanOrEqual(1000)
  })

  it('macros fecham com as calorias (4/4/9)', () => {
    const t = computeTargets(base)
    const kcalFromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9
    expect(Math.abs(kcalFromMacros - t.targetCalories)).toBeLessThanOrEqual(10)
  })
})

describe('parseInput (jsonb robusto)', () => {
  it('aceita objeto já parseado', () => {
    expect(parseInput(base)).toEqual(base)
  })

  it('aceita string JSON (pooler devolvendo texto)', () => {
    expect(parseInput(JSON.stringify(base))).toEqual(base)
  })

  it('aceita string duplamente serializada', () => {
    expect(parseInput(JSON.stringify(JSON.stringify(base)))).toEqual(base)
  })

  it('retorna null para JSON inválido', () => {
    expect(parseInput('{nope')).toBeNull()
  })

  it('retorna null para shape errado', () => {
    expect(parseInput({ foo: 'bar' })).toBeNull()
    expect(parseInput(null)).toBeNull()
    expect(parseInput(42)).toBeNull()
  })
})
