import { describe, expect, it } from 'vitest'
import type { CollectedUserData } from '../../shared/diet-ai-schema.js'
import { buildDayPrompt, computeTargets } from '../diets/jobs.service.js'
import { type UserContextData, formatKnownData, formatUserContext } from './chat-context.js'
import { assembleSystemPrompt, buildSystemPrompt } from './chat.service.js'

/**
 * OP5: snapshot dos prompts montados. Uma mudança de prompt tem que ser
 * VISÍVEL no diff do PR, não escondida numa string de 40 linhas.
 * Atualizar com `npx vitest run -u` só quando a mudança for intencional.
 */

// birth_date null de propósito: a idade calculada mudaria o snapshot a cada ano.
const perfis: { nome: string; ctx: UserContextData; hasActiveDiet: boolean }[] = [
  {
    nome: 'novo usuário sem nada',
    hasActiveDiet: false,
    ctx: {
      profile: null,
      diet: null,
      today: null,
      freeMeals: [],
      streak: null,
      mealsPerDay: null,
      date: '2026-09-09',
    },
  },
  {
    nome: 'dados conhecidos, sem dieta',
    hasActiveDiet: false,
    ctx: {
      profile: {
        weight_kg: 82,
        height_cm: 178,
        birth_date: null,
        gender: 'male',
        goal: 'lose_weight',
        activity_level: 'moderate',
        dietary_restrictions: ['sem lactose'],
        allergies: ['amendoim'],
      },
      diet: null,
      today: null,
      freeMeals: [],
      streak: 3,
      mealsPerDay: 4,
      date: '2026-09-09',
    },
  },
  {
    nome: 'dieta ativa',
    hasActiveDiet: true,
    ctx: {
      profile: {
        weight_kg: 60,
        height_cm: 165,
        birth_date: null,
        gender: 'female',
        goal: 'maintain',
        activity_level: 'light',
        dietary_restrictions: [],
        allergies: [],
      },
      diet: {
        name: 'Plano personalizado',
        targetCalories: 1800,
        targetProtein: 108,
        targetCarbs: 200,
        targetFat: 50,
      },
      today: null,
      freeMeals: [],
      streak: 12,
      mealsPerDay: 5,
      date: '2026-09-09',
    },
  },
]

describe('prompts do coach (snapshot)', () => {
  it.each(perfis)('$nome', ({ ctx, hasActiveDiet }) => {
    const prompt = assembleSystemPrompt(
      buildSystemPrompt('motivational'),
      formatUserContext(ctx),
      formatKnownData(ctx),
      hasActiveDiet,
    )
    expect(prompt).toMatchSnapshot()
  })
})

describe('prompt do dia (snapshot)', () => {
  const u: CollectedUserData = {
    weight_kg: 82,
    height_cm: 178,
    age: 31,
    gender: 'male',
    goal: 'lose_weight',
    activity_level: 'moderate',
    meals_per_day: 4,
    dietary_restrictions: ['sem lactose'],
    allergies: ['amendoim'],
    food_preferences: 'não gosta de peixe',
    message_to_user: 'ok',
    health_conditions: [],
  }
  it('dia 1 sem histórico', () => {
    expect(buildDayPrompt(u, computeTargets(u), 1)).toMatchSnapshot()
  })
  it('dia 3 com dias anteriores e feedback de rejeição', () => {
    expect(
      buildDayPrompt(
        u,
        computeTargets(u),
        3,
        'Segunda: Frango, Arroz\nTerça: Tilápia, Batata-doce',
        'ATENÇÃO — a tentativa anterior foi REJEITADA',
      ),
    ).toMatchSnapshot()
  })
})
