import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { plannedMealSchema } from './diets.schemas.js'
import { getTodayPlan, toPlannedMealType } from './diets.service.js'

describe('toPlannedMealType (6 tipos do banco -> 4 do app)', () => {
  it('mantém breakfast/lunch/dinner', () => {
    expect(toPlannedMealType('breakfast')).toBe('breakfast')
    expect(toPlannedMealType('lunch')).toBe('lunch')
    expect(toPlannedMealType('dinner')).toBe('dinner')
  })

  it('lanches e ceia viram snack', () => {
    expect(toPlannedMealType('morning_snack')).toBe('snack')
    expect(toPlannedMealType('afternoon_snack')).toBe('snack')
    expect(toPlannedMealType('supper')).toBe('snack')
  })

  it('valor desconhecido cai em snack (não quebra a UI)', () => {
    expect(toPlannedMealType('other')).toBe('snack')
  })
})

describe('getTodayPlan — fibra por refeição', () => {
  const DIET = '44444444-4444-4444-4444-444444444444'
  const DAY = '55555555-5555-5555-5555-555555555555'
  const meal = (id: string, total_fiber: string | number | null) => ({
    id,
    diet_day_id: DAY,
    meal_type: 'lunch',
    name: 'Almoço',
    time_suggestion: '12:00',
    total_calories: '600',
    total_protein: '40',
    total_carbs: '60',
    total_fat: '20',
    total_fiber,
    is_completed: false,
    completed_at: null,
    sort_order: 0,
  })

  function setup(meals: ReturnType<typeof meal>[]) {
    return fakeFastify([
      ['FROM diets', [{ id: DIET, created_at: '2026-10-01' }]],
      [
        'FROM diet_days',
        [{ id: DAY, total_calories: 1800, total_protein: 120, total_carbs: 180, total_fat: 60 }],
      ],
      ['FROM diet_meals', meals],
    ])
  }

  it('lê total_fiber via to_jsonb (funciona antes da migration 020: vira NULL)', async () => {
    const { fastify, calls } = setup([meal('66666666-6666-6666-6666-666666666666', null)])
    await getTodayPlan(fastify, 'u', { date: undefined })
    const q = calls.find((c) => c.sql.includes('FROM diet_meals'))
    expect(q?.sql).toContain("to_jsonb(diet_meals) ->> 'total_fiber'")
    expect(q?.sql).not.toMatch(/,\s*total_fiber\s*,/) // nunca a coluna crua
  })

  it('numeric vindo como string vira número; ausente vira null (não 0)', async () => {
    const A = '66666666-6666-6666-6666-666666666666'
    const B = '77777777-7777-7777-7777-777777777777'
    const C = '88888888-8888-8888-8888-888888888888'
    const { fastify } = setup([meal(A, '7.50'), meal(B, null), meal(C, 0)])
    const plan = await getTodayPlan(fastify, 'u')
    expect(plan?.meals.map((m) => m.fiber)).toEqual([7.5, null, 0])
    for (const m of plan?.meals ?? []) expect(plannedMealSchema.parse(m)).toEqual(m)
  })
})
