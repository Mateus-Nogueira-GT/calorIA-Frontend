import { describe, expect, it } from 'vitest'
import type { AiSingleDay, CollectedUserData } from '../../shared/diet-ai-schema.js'
import {
  buildDayPrompt,
  computeTargets,
  parseInput,
  reconcileDay,
  summarizePreviousDays,
} from './jobs.service.js'

/** Monta um dia com 1 refeição cujos itens têm as calorias dadas (macros = 1/4). */
function dayWithCalories(...itemCalories: number[]): AiSingleDay {
  return {
    day_name: 'Segunda',
    meals: [
      {
        meal_type: 'lunch',
        name: 'Almoço',
        time_suggestion: '12:00',
        total_calories: itemCalories.reduce((s, c) => s + c, 0),
        items: itemCalories.map((cal, i) => ({
          food_name: `Alimento ${i}`,
          quantity_g: cal, // usa a mesma escala pra testar o reescalonamento de quantidade
          unit: 'g',
          calories: cal,
          protein_g: cal / 4,
          carbs_g: cal / 4,
          fat_g: cal / 9,
          preparation_tip: null,
        })),
      },
    ],
  }
}

function totalCalories(day: AiSingleDay): number {
  return day.meals.reduce((s, m) => s + m.items.reduce((si, i) => si + i.calories, 0), 0)
}

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
  health_conditions: [],
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

  it('piso de 1200 kcal para mulheres (mínimo sem supervisão)', () => {
    const t = computeTargets({
      ...base,
      weight_kg: 35,
      height_cm: 140,
      age: 80,
      gender: 'female',
      activity_level: 'sedentary',
      goal: 'lose_weight',
    })
    expect(t.targetCalories).toBe(1200)
  })

  it('piso de 1500 kcal para homens e "outro"', () => {
    const magro = {
      ...base,
      weight_kg: 40,
      height_cm: 150,
      age: 90,
      activity_level: 'sedentary' as const,
      goal: 'lose_weight' as const,
    }
    expect(computeTargets({ ...magro, gender: 'male' }).targetCalories).toBe(1500)
    expect(computeTargets({ ...magro, gender: 'other' }).targetCalories).toBe(1500)
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

describe('reconcileDay (I4 — escala determinística à meta)', () => {
  it('dia dentro de ±10% da meta fica intacto', () => {
    const day = dayWithCalories(1000, 1100) // 2100
    const r = reconcileDay(day, 2000) // desvio 5%
    expect(r.scaled).toBe(false)
    expect(r.factor).toBe(1)
    expect(totalCalories(r.day)).toBe(2100)
  })

  it('dia 30% acima escala para ±1% da meta com macros proporcionais', () => {
    const day = dayWithCalories(1300, 1300) // 2600, meta 2000 → 30% acima
    const r = reconcileDay(day, 2000)
    expect(r.scaled).toBe(true)
    expect(Math.abs(totalCalories(r.day) - 2000) / 2000).toBeLessThanOrEqual(0.01)
    // proteína também escalou (era 2600/4=650 no total → ~500)
    const protein = r.day.meals[0].items.reduce((s, i) => s + i.protein_g, 0)
    expect(Math.abs(protein - 500)).toBeLessThanOrEqual(5)
  })

  it('fator é limitado a 0.6 quando a geração vem absurda (3x a meta)', () => {
    const day = dayWithCalories(3000, 3000) // 6000, meta 2000 → fator ideal 0.333
    const r = reconcileDay(day, 2000)
    expect(r.scaled).toBe(true)
    expect(r.factor).toBeCloseTo(0.6, 5)
    expect(totalCalories(r.day)).toBe(3600) // 6000 * 0.6
  })

  it('fator é limitado a 1.6 quando a geração vem muito baixa', () => {
    const day = dayWithCalories(500, 500) // 1000, meta 2000 → fator ideal 2.0
    const r = reconcileDay(day, 2000)
    expect(r.factor).toBeCloseTo(1.6, 5)
    expect(totalCalories(r.day)).toBe(1600)
  })

  it('arredonda ≥10 para inteiro e <10 para 1 casa decimal', () => {
    // item de 8 kcal, meta força fator 1.6 → 8*1.6 = 12.8 → 13 (>=10 inteiro)
    // e o macro fat_g = 8/9 ≈ 0.889 → *1.6 = 1.42 → 1.4 (<10, 1 casa)
    const day = dayWithCalories(8, 992) // total 1000, meta 2000 → fator 1.6
    const r = reconcileDay(day, 2000)
    const first = r.day.meals[0].items[0]
    expect(first.calories).toBe(13)
    expect(first.fat_g).toBeCloseTo(1.4, 5)
  })

  it('total zero não divide por zero (retorna intacto)', () => {
    const day = dayWithCalories(0)
    const r = reconcileDay(day, 2000)
    expect(r.scaled).toBe(false)
  })
})

describe('summarizePreviousDays (I3 — variedade entre dias)', () => {
  it('vazio no dia 1 (nenhum dia gerado)', () => {
    expect(summarizePreviousDays([])).toBe('')
  })

  it('lista os nomes dos dias anteriores (o prompt do dia N os vê)', () => {
    const s = summarizePreviousDays([
      { day_name: 'Segunda', foods: ['Frango grelhado', 'Arroz integral'] },
      { day_name: 'Terça', foods: ['Tilápia', 'Batata-doce'] },
    ])
    expect(s).toContain('Segunda')
    expect(s).toContain('Terça')
    expect(s).toContain('Frango grelhado')
  })

  it('limita a 8 alimentos por dia', () => {
    const foods = Array.from({ length: 20 }, (_, i) => `Alimento${i}`)
    const s = summarizePreviousDays([{ day_name: 'Segunda', foods }])
    expect(s).toContain('Alimento7')
    expect(s).not.toContain('Alimento8')
  })

  it('respeita o teto de 600 caracteres', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      day_name: `Dia${i}`,
      foods: ['Frango grelhado com legumes', 'Arroz integral', 'Feijão preto'],
    }))
    const s = summarizePreviousDays(rows)
    expect(s.length).toBeLessThanOrEqual(600)
  })
})

describe('buildDayPrompt (O5)', () => {
  it('lista os meal_type exatos na ordem canônica para meals_per_day', () => {
    const p = buildDayPrompt({ ...base, meals_per_day: 4 }, computeTargets(base), 1)
    expect(p).toContain('breakfast, lunch, afternoon_snack, dinner')
    expect(p).toMatch(/exatamente 4 refeições/)
  })

  it('sem feedback, não há seção de rejeição', () => {
    expect(buildDayPrompt(base, computeTargets(base), 1)).not.toContain('REJEITADA')
  })

  it('com feedback, a seção vem antes das regras', () => {
    const p = buildDayPrompt(
      base,
      computeTargets(base),
      2,
      '',
      'ATENÇÃO — a tentativa anterior foi REJEITADA',
    )
    expect(p).toContain('REJEITADA')
    expect(p.indexOf('REJEITADA')).toBeLessThan(p.indexOf('Regras:'))
  })

  // O validador (checkAllergens) rejeita uma restrição violada com a MESMA
  // severidade de uma alergia violada — se o prompt tratar restrição como
  // preferência, a IA gasta uma tentativa de regeneração numa regra que
  // nunca soube ser absoluta.
  it('restrições e alergias carregam a mesma linguagem de proibição', () => {
    const p = buildDayPrompt(
      { ...base, dietary_restrictions: ['vegetariano'], allergies: ['amendoim'] },
      computeTargets(base),
      1,
    )
    expect(p).toMatch(/Restrições alimentares \(PROIBIDO/)
    expect(p).toMatch(/Alergias \(PROIBIDO/)
  })
})
