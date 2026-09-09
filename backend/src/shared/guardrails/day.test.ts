import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import {
  describeViolations,
  fixItemCalories,
  mealTypesFor,
  reconcileOrFail,
  validateDay,
} from './day.js'

type Meal = AiSingleDay['meals'][number]
type MealType = Meal['meal_type']

function meal(type: MealType, items: Partial<Meal['items'][number]>[]): Meal {
  const full = items.map((it, i) => ({
    food_name: `Alimento ${i}`,
    quantity_g: 100,
    unit: 'g',
    calories: 200,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 8,
    preparation_tip: null,
    ...it,
  }))
  return {
    meal_type: type,
    name: type,
    time_suggestion: '12:00',
    total_calories: full.reduce((s, i) => s + i.calories, 0),
    items: full,
  }
}

const tresRefeicoes: AiSingleDay = {
  day_name: 'Segunda',
  meals: [meal('breakfast', [{}]), meal('lunch', [{}]), meal('dinner', [{}])],
}

describe('mealTypesFor (O5)', () => {
  it('3 → café, almoço, jantar; 6 → todos na ordem canônica', () => {
    expect(mealTypesFor(3)).toEqual(['breakfast', 'lunch', 'dinner'])
    expect(mealTypesFor(4)).toEqual(['breakfast', 'lunch', 'afternoon_snack', 'dinner'])
    expect(mealTypesFor(5)).toEqual([
      'breakfast',
      'morning_snack',
      'lunch',
      'afternoon_snack',
      'dinner',
    ])
    expect(mealTypesFor(6)).toEqual([
      'breakfast',
      'morning_snack',
      'lunch',
      'afternoon_snack',
      'dinner',
      'supper',
    ])
  })
})

describe('fixItemCalories (O2 — kcal coerente com macros)', () => {
  it('item coerente fica intacto', () => {
    // 10*4 + 20*4 + 8*9 = 192 ≈ 200 (4%)
    const r = fixItemCalories(tresRefeicoes)
    expect(r.fixed).toBe(0)
    expect(r.day).toEqual(tresRefeicoes)
  })

  it('item 40% fora tem kcal recalculada pelos macros e total da refeição refeito', () => {
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 400 }])] }
    const r = fixItemCalories(day)
    expect(r.fixed).toBe(1)
    expect(r.day.meals[0].items[0].calories).toBe(192)
    expect(r.day.meals[0].total_calories).toBe(192)
  })

  it('drift exatamente nos 25% do limite: ainda intacto (limite é <=)', () => {
    // macros 10p/20c/8f → esperado 192. calories=256 → drift (256-192)/256 = 25% exato
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 256 }])] }
    const r = fixItemCalories(day)
    expect(r.fixed).toBe(0)
    expect(r.day.meals[0].items[0].calories).toBe(256)
  })

  it('drift pouco acima de 25%: corrigida', () => {
    // mesmos macros (esperado 192). calories=257 → drift 65/257 ≈ 25,29% > 25%
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 257 }])] }
    const r = fixItemCalories(day)
    expect(r.fixed).toBe(1)
    expect(r.day.meals[0].items[0].calories).toBe(192)
    expect(r.day.meals[0].total_calories).toBe(192)
  })
})

describe('validateDay (O2)', () => {
  const targets = { protein: 30 } // 3 itens × 10 g = 30 g

  it('dia correto: sem violações', () => {
    expect(validateDay(tresRefeicoes, targets, 3)).toEqual([])
  })

  it('contagem de refeições diferente de meals_per_day', () => {
    const v = validateDay(tresRefeicoes, targets, 4)
    expect(v.map((x) => x.type)).toContain('MEAL_COUNT')
  })

  it('meal_type duplicado', () => {
    const day = {
      ...tresRefeicoes,
      meals: [meal('lunch', [{}]), meal('lunch', [{}]), meal('dinner', [{}])],
    }
    expect(validateDay(day, targets, 3).map((x) => x.type)).toContain('DUPLICATE_MEAL_TYPE')
  })

  it('tipos fora da ordem/conjunto canônico', () => {
    const day = {
      ...tresRefeicoes,
      meals: [meal('lunch', [{}]), meal('breakfast', [{}]), meal('dinner', [{}])],
    }
    const v = validateDay(day, targets, 3)
    expect(v.map((x) => x.type)).toContain('MEAL_ORDER')
    expect(v.find((x) => x.type === 'MEAL_ORDER')?.detail).toContain('breakfast, lunch, dinner')
  })

  it('quantidade zero/negativa e macro negativo', () => {
    const day = {
      ...tresRefeicoes,
      meals: [
        meal('breakfast', [{ quantity_g: 0 }]),
        meal('lunch', [{ fat_g: -1 }]),
        meal('dinner', [{}]),
      ],
    }
    const types = validateDay(day, targets, 3).map((x) => x.type)
    expect(types).toContain('NON_POSITIVE_QUANTITY')
    expect(types).toContain('NEGATIVE_MACRO')
  })

  it('proteína fora de ±20% da meta', () => {
    expect(validateDay(tresRefeicoes, { protein: 50 }, 3).map((x) => x.type)).toContain(
      'PROTEIN_OFF_TARGET',
    )
    expect(validateDay(tresRefeicoes, { protein: 36 }, 3)).toEqual([]) // 30/36 = -16.7%
  })

  it('proteína exatamente nos 20% do limite: sem violação (limite é <=)', () => {
    // total 30 g. Para drift = |30-t|/t = 20% exato: t = 30/0.8 = 37.5
    expect(validateDay(tresRefeicoes, { protein: 37.5 }, 3)).toEqual([])
  })

  it('proteína pouco acima de 20%: violação', () => {
    // t=37.6 → drift = 7.6/37.6 ≈ 20,21% > 20%
    const v = validateDay(tresRefeicoes, { protein: 37.6 }, 3)
    expect(v.map((x) => x.type)).toContain('PROTEIN_OFF_TARGET')
  })
})

describe('reconcileOrFail (O3)', () => {
  it('dentro do clamp: ok, dia reescalonado', () => {
    // 600 kcal, meta 800 → fator 1.33 (dentro de [0.6, 1.6])
    const r = reconcileOrFail(tresRefeicoes, 800)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.scaled).toBe(true)
  })

  it('clamp insuficiente (>15% fora após escalar): RECONCILE_FAILED', () => {
    // 600 kcal, meta 2000 → fator ideal 3.3, clamp 1.6 → 960 (52% abaixo)
    const r = reconcileOrFail(tresRefeicoes, 2000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violation.type).toBe('RECONCILE_FAILED')
  })

  it('fator clamped mas resultado ainda dentro de 15%: ok (o caso que faltava)', () => {
    // total 531.25 kcal, meta 1000 → fator ideal 1000/531.25 ≈ 1.882 > 1.6 → clamp em 1.6.
    // 531.25 * 1.6 = 850 (exato). drift = |850-1000|/1000 = 15% exato (limite é <=)
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 531.25 }])] }
    const r = reconcileOrFail(day, 1000)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.scaled).toBe(true)
      expect(r.factor).toBe(1.6) // clamp atingido, não o fator ideal 1.882
      expect(r.day.meals[0].items[0].calories).toBe(850)
    }
  })

  it('drift pouco acima de 15% após clamp: RECONCILE_FAILED', () => {
    // mesmo total 531.25 → mesmo clamp em 1.6 → mesmo resultado 850 kcal.
    // meta 1001 → drift = |850-1001|/1001 = 151/1001 ≈ 15,08% > 15%
    const day: AiSingleDay = { day_name: 'x', meals: [meal('lunch', [{ calories: 531.25 }])] }
    const r = reconcileOrFail(day, 1001)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.violation.type).toBe('RECONCILE_FAILED')
  })
})

describe('describeViolations', () => {
  it('gera feedback legível para o prompt de regeneração', () => {
    const txt = describeViolations([
      { type: 'ALLERGEN', detail: "'Pasta de amendoim' contém amendoim (alergia: amendoim)" },
      { type: 'MEAL_COUNT', detail: 'vieram 4 refeições; precisam ser exatamente 6' },
    ])
    expect(txt).toContain('REJEITADA')
    expect(txt).toContain('amendoim')
    expect(txt).toContain('exatamente 6')
  })
})
