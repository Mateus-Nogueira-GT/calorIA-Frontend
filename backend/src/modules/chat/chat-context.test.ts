import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import type { TodayPlan } from '../diets/diets.schemas.js'
import {
  type UserContextData,
  ageFromBirthDate,
  fetchUserContext,
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
        fiber: 6,
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
        fiber: null,
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
          fiber: null,
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
    expect(out).toContain('Restante do dia: faltam 1385 kcal; faltam 102g de proteína.')
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

describe('formatUserContext — truncamento por linha (C4)', () => {
  function bigData(): UserContextData {
    return {
      profile: fullProfile,
      diet: {
        name: 'Plano '.repeat(530).trim(), // ~3180 chars: força o corte (teto 3600)
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      freeMeals: [],
      streak: 12,
      mealsPerDay: 4,
      date: '2026-07-24',
    }
  }

  it('nunca corta uma linha no meio: toda linha termina com ponto', () => {
    const out = formatUserContext(bigData())
    expect(out.length).toBeLessThanOrEqual(3600)
    const lines = out.split('\n').slice(1) // sem o cabeçalho
    for (const l of lines) expect(l).toMatch(/\.$/)
  })

  it('as linhas numéricas (meta, consumido, faltam) vêm antes das descritivas', () => {
    // Fixture normal (nome de dieta curto) — diferente de bigData(): aqui o corte
    // não entra em ação, então tanto "Faltam:" quanto "Perfil:" sobrevivem e dá
    // para comparar a posição relativa dos dois. Com bigData() o nome gigante da
    // dieta consome todo o teto e "Perfil:" é descartado (indexOf === -1), o que
    // quebraria esta asserção independente da ordem estar certa ou errada.
    const data: UserContextData = {
      profile: fullProfile,
      diet: {
        name: 'Plano personalizado',
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      freeMeals: [],
      streak: 12,
      mealsPerDay: 4,
      date: '2026-07-24',
    }
    const out = formatUserContext(data)
    expect(out.indexOf('Restante do dia:')).toBeGreaterThan(-1)
    expect(out.indexOf('Perfil:')).toBeGreaterThan(-1)
    expect(out.indexOf('Restante do dia:')).toBeLessThan(out.indexOf('Perfil:'))
  })

  it('o que não cabe é a ÚLTIMA linha (streak), não a do restante do dia', () => {
    const out = formatUserContext(bigData())
    expect(out).toContain('Restante do dia: faltam 1480 kcal; faltam 102g de proteína.')
    expect(out).not.toContain('Streak')
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

describe('dados do cadastro (F2)', () => {
  const baseProfile = {
    weight_kg: 80,
    height_cm: 175,
    birth_date: null,
    gender: null,
    goal: null,
    activity_level: null,
    dietary_restrictions: null,
    allergies: null,
  }

  it('DECIMAL vindo como string do postgres.js → número sem zeros à direita', async () => {
    const { fastify } = fakeFastify([
      [
        'birth_date::TEXT AS birth_date',
        [{ ...baseProfile, weight_kg: '80.50', height_cm: '175.00', body_type: null }],
      ],
    ])
    const ctx = await fetchUserContext(fastify, 'u1', { date: '2026-07-24' })
    const out = formatKnownData(ctx)
    expect(out).toContain('peso: 80.5kg')
    expect(out).not.toContain('80.50')
    expect(out).toContain('altura: 175cm')
    expect(formatUserContext(ctx)).toContain('80.5kg')
    expect(formatUserContext(ctx)).not.toContain('80.50')
  })

  it('biotipo conhecido → listado com o rótulo do app', () => {
    const out = formatKnownData({
      ...emptyData,
      profile: { ...baseProfile, body_type: 'mesomorph' },
    })
    expect(out).toContain('biotipo: Atlético / Versátil (mesomorfo)')
    expect(
      formatKnownData({ ...emptyData, profile: { ...baseProfile, body_type: 'ectomorph' } }),
    ).toContain('biotipo: Magro / Acelerado (ectomorfo)')
    expect(
      formatKnownData({ ...emptyData, profile: { ...baseProfile, body_type: 'endomorph' } }),
    ).toContain('biotipo: Largo (endomorfo)')
  })

  it('biotipo unknown/null → não lista biotipo', () => {
    for (const body_type of ['unknown', null]) {
      const out = formatKnownData({ ...emptyData, profile: { ...baseProfile, body_type } })
      expect(out).not.toContain('biotipo')
    }
  })

  it('goal health → orienta usar goal=maintain', () => {
    const out = formatKnownData({ ...emptyData, profile: { ...baseProfile, goal: 'health' } })
    expect(out).toContain('objetivo: manter peso / melhorar saúde (use goal=maintain)')
  })
})

describe('registro com valores impossíveis (feedback 27/10)', () => {
  const absurd = {
    id: 'm9',
    name: 'teste',
    calories: 999_999,
    protein: 999_999,
    carbs: 999_999,
    fat: 999_999,
    fiber: 999_999,
    loggedAt: '2026-07-24T12:00:00Z',
    mealType: 'lunch' as const,
  }
  const apple = {
    ...absurd,
    id: 'm1',
    name: 'Maçã',
    calories: 95,
    protein: 0,
    carbs: 25,
    fat: 0,
    fiber: null,
  }
  const diet = {
    name: 'Plano',
    targetCalories: 1695,
    targetProtein: 167,
    targetCarbs: 148,
    targetFat: 47,
  }

  it('não entra no consumido e o coach é avisado para pedir correção', () => {
    const out = formatUserContext({ ...emptyData, diet, freeMeals: [apple, absurd] })
    expect(out).toContain('consumidas 95 kcal')
    expect(out).not.toContain('999')
    expect(out).toContain('diário livre: 1 item(ns)')
    expect(out).toMatch(/1 registro com valores impossíveis.*ignorado.*corrigir ou apagar/)
  })

  it('sem dieta: também ignora e avisa', () => {
    const out = formatUserContext({ ...emptyData, freeMeals: [absurd] })
    expect(out).not.toContain('999')
    expect(out).toMatch(/1 registro com valores impossíveis/)
  })
})

describe('perfil com valor impossível não vira dado conhecido do coach', () => {
  const broken = { ...fullProfile, weight_kg: 0.1, height_cm: 1, birth_date: '1800-01-01' }

  it('formatKnownData omite peso, altura e idade impossíveis', () => {
    const out = formatKnownData({ ...emptyData, profile: broken })
    expect(out).not.toContain('0.1kg')
    expect(out).not.toMatch(/altura: 1cm/)
    expect(out).not.toMatch(/idade: 2\d\d anos/)
    expect(out).toContain('restrições')
  })

  it('formatUserContext também', () => {
    const out = formatUserContext({ ...emptyData, profile: broken })
    expect(out).not.toContain('0.1kg')
    expect(out).not.toContain(' 1cm')
  })

  it('perfil normal continua igual', () => {
    expect(formatKnownData({ ...emptyData, profile: fullProfile })).toContain('peso: 82kg')
  })
})

describe('registros de hoje no contexto (coach antenado, 04/11)', () => {
  const meal = (o: Record<string, unknown>) => ({
    id: 'abcdef12-0000-0000-0000-000000000000',
    name: 'Carne suína grelhada',
    calories: 420,
    protein: 38,
    carbs: 0,
    fat: 29,
    fiber: null,
    weightGrams: 180,
    loggedAt: '2026-07-24 23:14:00+00',
    mealType: 'dinner' as const,
    ...o,
  })
  const diet = {
    name: 'Plano',
    targetCalories: 2100,
    targetProtein: 148,
    targetCarbs: 210,
    targetFat: 58,
  }

  it('lista nome, peso, valores, horário local e ref, mais recentes primeiro', () => {
    const out = formatUserContext({
      ...emptyData,
      diet,
      tzOffsetMinutes: -180,
      freeMeals: [
        meal({
          id: '9f8e7d00-0000-0000-0000-000000000000',
          name: 'Arroz com feijão',
          weightGrams: 250,
          calories: 330,
          protein: 11,
          carbs: 60,
          fat: 4,
          loggedAt: '2026-07-24 15:30:00+00',
        }),
        meal({}),
      ],
    })
    expect(out).toContain('Registros de hoje no diário (mais recentes primeiro):')
    expect(out).toContain(
      '- [ref abcdef] 20:14 Carne suína grelhada — 180 g · 420 kcal · P 38 g · C 0 g · G 29 g.',
    )
    expect(out).toContain(
      '- [ref 9f8e7d] 12:30 Arroz com feijão — 250 g · 330 kcal · P 11 g · C 60 g · G 4 g.',
    )
    expect(out.indexOf('Carne suína')).toBeLessThan(out.indexOf('Arroz com feijão'))
  })

  it('no máximo 8 itens e sem registro impossível', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      meal({
        id: `0000000${i}-0000-0000-0000-000000000000`,
        name: `Item ${i}`,
        loggedAt: `2026-07-24 1${i}:00:00+00`,
      }),
    )
    const out = formatUserContext({
      ...emptyData,
      freeMeals: [...many, meal({ id: 'zzzzzz00-0', calories: 999999 })],
    })
    expect((out.match(/- \[ref /g) ?? []).length).toBe(8)
    expect(out).not.toContain('999999')
  })

  it('refeições do plano concluídas aparecem pelo nome', () => {
    const out = formatUserContext({ ...emptyData, diet, today: todayPlan(), freeMeals: [] })
    expect(out).toContain('- 12:00 Almoço (concluída) — 620 kcal')
  })

  it('instrui a usar a lista quando o usuário fala da refeição', () => {
    const out = formatUserContext({ ...emptyData, diet, freeMeals: [meal({})] })
    expect(out).toMatch(/minha refeição.*use esta lista/i)
  })
})

describe('último peso da Evolução (04/11)', () => {
  it('entra no contexto e vira o peso conhecido, no lugar do cadastro', () => {
    const data = {
      ...emptyData,
      profile: fullProfile,
      lastWeight: { kg: 79.4, date: '2026-11-02' },
    }
    const out = formatUserContext(data)
    // 05/11 (M7): um peso só no contexto — o mais recente, com a origem.
    expect(out).toContain('Perfil: 79.4kg (Evolução, 02/11), 178cm')
    expect(out).not.toContain('82kg')
    expect(out).not.toContain('Último peso registrado')
    const known = formatKnownData(data)
    expect(known).toContain('peso: 79.4kg')
    expect(known).not.toContain('peso: 82kg')
  })

  it('fetchUserContext busca o registro mais recente dentro da faixa plausível', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM weight_entries', [{ weight_kg: '79.4', date: '2026-11-02' }]],
    ])
    const ctx = await fetchUserContext(fastify, '11111111-1111-1111-1111-111111111111', {
      date: '2026-11-04',
    })
    expect(ctx.lastWeight).toEqual({ kg: 79.4, date: '2026-11-02' })
    const q = calls.find((c) => c.sql.includes('FROM weight_entries'))
    expect(q?.sql).toContain('ORDER BY date DESC, created_at DESC')
    expect(q?.params).toEqual(expect.arrayContaining([30, 300]))
  })
})

describe('restante do dia sem número negativo (05/11, M8)', () => {
  const diet = {
    name: 'Plano',
    targetCalories: 2100,
    targetProtein: 148,
    targetCarbs: 210,
    targetFat: 58,
  }
  const eaten = (calories: number, protein: number) => ({
    id: 'abcdef12-0000-0000-0000-000000000000',
    name: 'Rodízio',
    calories,
    protein,
    carbs: 0,
    fat: 0,
    fiber: null,
    loggedAt: '2026-07-24 23:14:00+00',
    mealType: 'dinner' as const,
  })

  it('passou da meta → diz quanto passou', () => {
    const out = formatUserContext({ ...emptyData, diet, freeMeals: [eaten(2450, 160)] })
    expect(out).toContain(
      'Restante do dia: passou da meta em 350 kcal; passou da meta de proteína em 12g.',
    )
    expect(out).not.toContain('-350')
    expect(out).not.toContain('-12')
  })

  it('bateu exatamente → meta atingida', () => {
    const out = formatUserContext({ ...emptyData, diet, freeMeals: [eaten(2100, 148)] })
    expect(out).toContain('Restante do dia: meta de calorias atingida; meta de proteína atingida.')
  })
})

describe('ordem do corte com contexto longo (05/11, M9)', () => {
  it('diário cheio de nomes longos não derruba o aviso de registro impossível nem o perfil', () => {
    const long = (i: number) => ({
      id: `${i}bcdef12-0000-0000-0000-000000000000`,
      name: `Prato muito comprido número ${i} `.repeat(5),
      calories: 400,
      protein: 30,
      carbs: 40,
      fat: 10,
      fiber: null,
      weightGrams: 300,
      loggedAt: `2026-07-24 1${i}:00:00+00`,
      mealType: 'lunch' as const,
    })
    const out = formatUserContext({
      ...emptyData,
      profile: fullProfile,
      diet: {
        name: 'Plano',
        targetCalories: 2100,
        targetProtein: 148,
        targetCarbs: 210,
        targetFat: 58,
      },
      today: todayPlan(),
      streak: 3,
      freeMeals: [
        ...Array.from({ length: 8 }, (_, i) => long(i)),
        { ...long(9), calories: 999_999 },
      ],
    })
    expect(out.length).toBeLessThanOrEqual(3600)
    expect(out).toMatch(/1 registro com valores impossíveis/)
    expect(out).toContain('Perfil:')
    expect(out).toContain('Alergias: amendoim')
    expect(out.indexOf('valores impossíveis')).toBeLessThan(out.indexOf('Registros de hoje'))
    // Nome do registro cortado em 60 caracteres.
    const line = out.split('\n').find((l) => l.startsWith('- [ref 0bcdef]')) ?? ''
    const name = line.replace(/^- \[ref \w+\] \d\d:\d\d /, '').split(' — ')[0]
    expect(name.length).toBeLessThanOrEqual(60)
  })
})

describe('plano de hoje no contexto (05/11, M5)', () => {
  const diet = {
    name: 'Plano',
    targetCalories: 2100,
    targetProtein: 148,
    targetCarbs: 210,
    targetFat: 58,
  }
  const item = (name: string, quantity: number, unit = 'g') => ({
    name,
    quantity,
    unit,
    calories: 100,
  })

  it('lista cada refeição com horário, status, kcal e itens', () => {
    const plan = todayPlan()
    plan.meals[0].items = [item('arroz', 120), item('ovo', 2, 'un')]
    plan.meals[1].items = [item('frango grelhado', 150)]
    const out = formatUserContext({ ...emptyData, diet, today: plan })
    expect(out).toContain('Plano de hoje:')
    expect(out).toContain('- 12:00 Almoço (concluída) — 620 kcal: arroz 120 g, ovo 2 un.')
    expect(out).toContain('- 19:00 Jantar — 620 kcal: frango grelhado 150 g.')
    expect(out).toMatch(/troca.*sem dizer que alterou o plano/i)
  })

  it('mais de 6 itens → "+N itens"', () => {
    const plan = todayPlan()
    plan.meals[1].items = Array.from({ length: 8 }, (_, i) => item(`item${i}`, 10))
    const out = formatUserContext({ ...emptyData, diet, today: plan })
    expect(out).toContain('item5 10 g, +2 itens.')
    expect(out).not.toContain('item6')
  })

  it('o plano vem antes do diário e depois do perfil', () => {
    const out = formatUserContext({
      ...emptyData,
      profile: fullProfile,
      diet,
      today: todayPlan(),
      freeMeals: [
        {
          id: 'abcdef12-0000-0000-0000-000000000000',
          name: 'Maçã',
          calories: 95,
          protein: 0,
          carbs: 25,
          fat: 0,
          fiber: null,
          loggedAt: '2026-07-24 16:00:00+00',
          mealType: 'snack' as const,
        },
      ],
    })
    expect(out.indexOf('Perfil:')).toBeLessThan(out.indexOf('Plano de hoje:'))
    expect(out.indexOf('Plano de hoje:')).toBeLessThan(out.indexOf('Registros de hoje'))
  })
})
