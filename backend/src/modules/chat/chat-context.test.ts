import { describe, expect, it } from 'vitest'
import type { TodayPlan } from '../diets/diets.schemas.js'
import {
  type UserContextData,
  ageFromBirthDate,
  formatKnownData,
  formatUserContext,
} from './chat-context.js'

const fullProfile = {
  weight_kg: 82,
  height_cm: 178,
  birth_date: '1995-03-10',
  gender: 'male',
  goal: 'lose_weight',
  activity_level: 'moderate',
  dietary_restrictions: ['sem lactose'],
  allergies: ['amendoim'],
}

function todayPlan(overrides: Partial<TodayPlan> = {}): TodayPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    date: '2026-07-24',
    meals: [
      {
        id: '00000000-0000-0000-0000-0000000000a1',
        type: 'lunch',
        title: 'Almoço',
        suggestedTime: '12:00',
        items: [],
        calories: 620,
        protein: 46,
        carbs: 60,
        fat: 18,
        completedAt: '2026-07-24T15:00:00Z',
        completedToday: true,
      },
      {
        id: '00000000-0000-0000-0000-0000000000a2',
        type: 'dinner',
        title: 'Jantar',
        suggestedTime: '19:00',
        items: [],
        calories: 620,
        protein: 40,
        carbs: 55,
        fat: 20,
        completedAt: null,
        completedToday: false,
      },
    ],
    totalCalories: 2100,
    totalProtein: 148,
    totalCarbs: 210,
    totalFat: 58,
    generatedAt: '2026-07-20T10:00:00Z',
    ...overrides,
  }
}

const emptyData: UserContextData = {
  profile: null,
  diet: null,
  today: null,
  freeMeals: [],
  streak: null,
  mealsPerDay: null,
  date: '2026-07-24',
}

describe('ageFromBirthDate', () => {
  it('calcula a idade no instante dado', () => {
    expect(ageFromBirthDate('1995-03-10', new Date('2026-07-24T12:00:00Z'))).toBe(31)
    // antes do aniversário no ano
    expect(ageFromBirthDate('1995-12-10', new Date('2026-07-24T12:00:00Z'))).toBe(30)
  })
  it('null para ausente/inválida', () => {
    expect(ageFromBirthDate(null)).toBeNull()
    expect(ageFromBirthDate('xx')).toBeNull()
  })
})

describe('formatUserContext (I1)', () => {
  it('dados vazios → string vazia', () => {
    expect(formatUserContext(emptyData)).toBe('')
  })

  it('só perfil → só a linha de perfil, sem dieta/hoje', () => {
    const out = formatUserContext({ ...emptyData, profile: fullProfile })
    expect(out).toContain('Perfil:')
    expect(out).toContain('82kg')
    expect(out).not.toContain('Dieta ativa')
  })

  it('com dieta + progresso do dia calcula consumido e faltante', () => {
    const data: UserContextData = {
      ...emptyData,
      profile: fullProfile,
      diet: {
        name: 'Plano personalizado',
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      freeMeals: [
        {
          id: 'm1',
          name: 'Maçã',
          calories: 95,
          protein: 0,
          carbs: 25,
          fat: 0,
          loggedAt: '2026-07-24T16:00:00Z',
          mealType: 'snack',
        },
      ],
      streak: 5,
    }
    const out = formatUserContext(data)
    // almoço concluído (620) + maçã (95) = 715 kcal
    expect(out).toContain('consumidas 715 kcal')
    // faltam 2100-715 = 1385
    expect(out).toContain('Faltam: 1385 kcal')
    // próxima refeição = jantar (não concluído)
    expect(out).toContain('Próxima refeição do plano: Jantar')
    expect(out).toContain('Streak atual: 5 dias')
  })

  it('respeita o teto de 1.400 caracteres', () => {
    const data: UserContextData = {
      ...emptyData,
      profile: {
        ...fullProfile,
        dietary_restrictions: Array.from({ length: 20 }, (_, i) => `restricao-longa-numero-${i}`),
        allergies: Array.from({ length: 20 }, (_, i) => `alergia-longa-numero-${i}`),
      },
      diet: {
        name: 'x'.repeat(200),
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      streak: 5,
    }
    expect(formatUserContext(data).length).toBeLessThanOrEqual(1400)
  })
})

describe('formatKnownData (I2)', () => {
  it('perfil completo → lista todos os campos conhecidos', () => {
    const out = formatKnownData({ ...emptyData, profile: fullProfile, mealsPerDay: 4 })
    expect(out).toContain('DADOS JÁ CONHECIDOS')
    expect(out).toContain('peso: 82kg')
    expect(out).toContain('objetivo: perder peso')
    expect(out).toContain('refeições/dia: 4')
  })

  it('perfil vazio → string vazia', () => {
    expect(formatKnownData(emptyData)).toBe('')
  })

  it('perfil parcial → só os campos preenchidos', () => {
    const out = formatKnownData({
      ...emptyData,
      profile: {
        weight_kg: 70,
        height_cm: null,
        birth_date: null,
        gender: null,
        goal: 'maintain',
        activity_level: null,
        dietary_restrictions: null,
        allergies: null,
      },
    })
    expect(out).toContain('peso: 70kg')
    expect(out).toContain('objetivo: manter peso')
    expect(out).not.toContain('altura')
    expect(out).not.toContain('idade')
  })
})
