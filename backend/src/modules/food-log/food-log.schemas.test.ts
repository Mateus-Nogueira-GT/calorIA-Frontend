import { describe, expect, it } from 'vitest'
import { addMealBodySchema, MEAL_LIMITS, updateMealBodySchema } from './food-log.schemas.js'

const body = {
  name: 'Arroz',
  calories: 200,
  protein: 4,
  carbs: 44,
  fat: 1,
  mealType: 'lunch' as const,
}

describe('limites de plausibilidade por refeição', () => {
  it('aceita valores no teto', () => {
    const r = addMealBodySchema.safeParse({
      ...body,
      calories: MEAL_LIMITS.calories,
      protein: MEAL_LIMITS.protein,
      carbs: MEAL_LIMITS.carbs,
      fat: MEAL_LIMITS.fat,
      fiber: MEAL_LIMITS.fiber,
    })
    expect(r.success).toBe(true)
  })

  it.each(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const)(
    'rejeita %s acima do teto com mensagem do campo',
    (field) => {
      const r = addMealBodySchema.safeParse({ ...body, [field]: 999_999 })
      expect(r.success).toBe(false)
      const issue = r.error!.issues.find((i) => i.path[0] === field)
      expect(issue?.message).toMatch(/^Máximo de .+ por refeição$/)
    },
  )

  it('rejeita Infinity', () => {
    expect(addMealBodySchema.safeParse({ ...body, calories: Infinity }).success).toBe(false)
  })

  it('o PATCH herda os limites', () => {
    expect(updateMealBodySchema.safeParse({ ...body, calories: 999_999 }).success).toBe(false)
    expect(updateMealBodySchema.safeParse({ ...body, calories: 4800 }).success).toBe(true)
  })
})
