import { beforeEach, describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { MEAL_LIMITS, updateMealBodySchema } from './food-log.schemas.js'
import { addMeal, getSummary, listMeals, updateMeal } from './food-log.service.js'
import { __resetMealFiberColumnsCache } from './meal-fiber-columns.js'

const USER = '11111111-1111-1111-1111-111111111111'
const MEAL = '22222222-2222-2222-2222-222222222222'
const COLS = 'information_schema.columns'
const body = {
  name: 'Arroz',
  calories: 200,
  protein: 4,
  carbs: 44,
  fat: 1,
  mealType: 'lunch' as const,
}

beforeEach(() => __resetMealFiberColumnsCache())

describe('listMeals — fibra', () => {
  it('devolve total_fiber como número, e null quando não há dado', async () => {
    const row = {
      id: MEAL,
      name: 'Arroz',
      meal_type: 'lunch',
      total_calories: '200',
      total_protein: '4',
      total_carbs: '44',
      total_fat: '1',
      logged_at: '2026-10-12 12:00:00+00',
    }
    const { fastify } = fakeFastify([
      [
        'FROM meals',
        [
          { ...row, total_fiber: '3.50' },
          { ...row, id: 'x', total_fiber: null },
        ],
      ],
    ])
    const meals = await listMeals(fastify, USER, '2026-10-12')
    expect(meals[0].fiber).toBe(3.5)
    expect(meals[1].fiber).toBeNull()
  })
})

describe('addMeal — fibra', () => {
  it('com a migration 022: grava fiber_g', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00' }]],
    ])
    const meal = await addMeal(fastify, USER, { ...body, fiber: 5 })
    expect(meal.fiber).toBe(5)
    const item = calls.find((c) => c.sql.includes('INSERT INTO meal_items'))
    expect(item?.sql).toContain('fiber_g')
    expect(item?.params).toContain(5)
  })

  it('sem a migration 022: grava como antes e devolve fiber null', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 0 }]],
      ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00' }]],
    ])
    const meal = await addMeal(fastify, USER, { ...body, fiber: 5 })
    expect(meal.fiber).toBeNull()
    const item = calls.find((c) => c.sql.includes('INSERT INTO meal_items'))
    expect(item?.sql).not.toContain('fiber_g')
  })
})

describe('updateMeal', () => {
  it('atualiza nome/tipo e troca o item da refeição pelos novos valores', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['UPDATE meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00', meal_type: 'dinner' }]],
    ])
    const meal = await updateMeal(fastify, USER, MEAL, { ...body, mealType: 'dinner', fiber: null })
    expect(meal).toMatchObject({
      id: MEAL,
      name: 'Arroz',
      calories: 200,
      fiber: null,
      mealType: 'dinner',
    })
    const update = calls.find((c) => c.sql.includes('UPDATE meals'))
    expect(update?.params).toEqual(expect.arrayContaining([MEAL, USER]))
    expect(calls.some((c) => c.sql.includes('DELETE FROM meal_items'))).toBe(true)
    expect(calls.some((c) => c.sql.includes('INSERT INTO meal_items'))).toBe(true)
  })

  it('refeição inexistente ou de outro usuário → 404 MEAL_NOT_FOUND', async () => {
    const { fastify } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['UPDATE meals', []],
    ])
    await expect(updateMeal(fastify, USER, MEAL, body)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MEAL_NOT_FOUND',
    })
  })

  it('sem a migration 022: edita sem tocar em fiber_g', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 0 }]],
      ['UPDATE meals', [{ id: MEAL, logged_at: '2026-10-12 12:00:00+00', meal_type: 'lunch' }]],
    ])
    const meal = await updateMeal(fastify, USER, MEAL, { ...body, fiber: 4 })
    expect(meal.fiber).toBeNull()
    // A checagem de colunas (information_schema) cita fiber_g no texto; o que
    // importa é que nenhuma escrita toque na coluna.
    const writes = calls.filter((c) => !c.sql.includes(COLS))
    expect(writes.some((c) => c.sql.includes('fiber_g'))).toBe(false)
  })
})

describe('updateMealBodySchema', () => {
  it('exige mealType: um PATCH sem tipo não pode zerar o grupo da refeição', () => {
    const { mealType: _omit, ...semTipo } = body
    expect(updateMealBodySchema.safeParse(semTipo).success).toBe(false)
    expect(updateMealBodySchema.safeParse(body).success).toBe(true)
  })
})

describe('peso revisado do scanner', () => {
  it('grava as gramas recebidas na coluna quantity_g existente', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['INSERT INTO meals', [{ id: MEAL, logged_at: '2026-10-22 12:00:00+00' }]],
    ])
    await addMeal(fastify, USER, { ...body, weightGrams: 250 })
    expect(calls.find((c) => c.sql.includes('INSERT INTO meal_items'))?.params).toEqual(
      expect.arrayContaining([250]),
    )
  })
  it('edição de cliente sem campo peso preserva a quantidade salva', async () => {
    const { fastify, calls } = fakeFastify([
      [COLS, [{ n: 2 }]],
      ['UPDATE meals', [{ id: MEAL, logged_at: '2026-10-22 12:00:00+00', meal_type: 'lunch' }]],
      ['SELECT quantity_g', [{ quantity_g: '275.5' }]],
    ])
    await updateMeal(fastify, USER, MEAL, body)
    expect(calls.find((c) => c.sql.includes('INSERT INTO meal_items'))?.params).toContain(275.5)
  })
})

describe('getSummary — registro impossível não entra na soma', () => {
  it('a consulta exclui linhas acima dos tetos', async () => {
    const { fastify, calls } = fakeFastify([['FROM meals', []]])
    await getSummary(fastify, USER, '2026-10-21', '2026-10-27')
    const q = calls[0]
    expect(q.sql).toContain('total_calories <=')
    expect(q.sql).toContain('total_protein <=')
    expect(q.params).toContain(MEAL_LIMITS.calories)
    expect(q.params).toContain(MEAL_LIMITS.fat)
  })
})
