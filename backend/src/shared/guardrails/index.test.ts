import { describe, expect, it } from 'vitest'
import type { AiSingleDay } from '../diet-ai-schema.js'
import { applyDayGuardrails } from './index.js'

/** Dia com N refeições canônicas, 1 item cada, somando `kcal` e `protein` no total. */
function buildDay(
  mealsPerDay: 3 | 4,
  kcal: number,
  protein: number,
  food = 'Frango grelhado',
): AiSingleDay {
  const types =
    mealsPerDay === 3
      ? (['breakfast', 'lunch', 'dinner'] as const)
      : (['breakfast', 'lunch', 'afternoon_snack', 'dinner'] as const)
  const n = types.length
  const p = protein / n
  const f = (kcal * 0.25) / 9 / n
  const c = (kcal / n - 4 * p - 9 * f) / 4
  return {
    day_name: 'Segunda',
    meals: types.map((t) => ({
      meal_type: t,
      name: t,
      time_suggestion: '12:00',
      total_calories: kcal / n,
      items: [
        {
          food_name: food,
          quantity_g: 150,
          unit: 'g',
          calories: kcal / n,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
          preparation_tip: null,
        },
      ],
    })),
  }
}

const input = { allergies: ['amendoim'], dietary_restrictions: [], meals_per_day: 3 }
const targets = { targetCalories: 2000, protein: 140 }

/**
 * Dia escrito à mão — `buildDay` sempre gera itens com kcal coerente aos
 * macros por construção, então não serve para exercitar `fixItemCalories`.
 *
 * Item do café: kcal informada 5000, mas 4·20 + 4·100 + 9·0 = 480 (desvio
 * 904% da informada → `fixItemCalories` corrige para 480). Almoço e jantar
 * já são coerentes (4·60 + 4·120 + 9·20 = 900) e não mudam.
 *
 * Total ANTES da correção: 5000 + 900 + 900 = 6800 kcal, 240% acima da meta
 * de 2000. Fator ideal 2000/6800 ≈ 0.294 fica abaixo do piso do clamp (0.6)
 * → trava em 0.6 → 6800·0.6 = 4080 kcal, ainda 104% acima da meta (>15%) →
 * SE `reconcileOrFail` recebesse este dia bruto, o resultado seria
 * RECONCILE_FAILED.
 *
 * Total DEPOIS da correção: 480 + 900 + 900 = 2280 kcal, 14% acima da meta
 * → fator 2000/2280 ≈ 0.877 (dentro do clamp, sem travar) → escala para
 * ~2000 kcal. Proteína 140 g · 0.877 ≈ 123 g, 12% abaixo da meta de 140 g
 * (dentro da tolerância de 20%). Nenhuma violação → ok:true.
 */
function buildDayWithIncoherentItem(): AiSingleDay {
  return {
    day_name: 'Terça',
    meals: [
      {
        meal_type: 'breakfast',
        name: 'breakfast',
        time_suggestion: '08:00',
        total_calories: 5000,
        items: [
          {
            food_name: 'Batata doce com whey',
            quantity_g: 150,
            unit: 'g',
            calories: 5000, // errada: 4·20 + 4·100 + 9·0 = 480
            protein_g: 20,
            carbs_g: 100,
            fat_g: 0,
            preparation_tip: null,
          },
        ],
      },
      {
        meal_type: 'lunch',
        name: 'lunch',
        time_suggestion: '12:00',
        total_calories: 900,
        items: [
          {
            food_name: 'Frango com arroz',
            quantity_g: 150,
            unit: 'g',
            calories: 900, // coerente: 4·60 + 4·120 + 9·20 = 900
            protein_g: 60,
            carbs_g: 120,
            fat_g: 20,
            preparation_tip: null,
          },
        ],
      },
      {
        meal_type: 'dinner',
        name: 'dinner',
        time_suggestion: '19:00',
        total_calories: 900,
        items: [
          {
            food_name: 'Carne com batata',
            quantity_g: 150,
            unit: 'g',
            calories: 900, // coerente: 4·60 + 4·120 + 9·20 = 900
            protein_g: 60,
            carbs_g: 120,
            fat_g: 20,
            preparation_tip: null,
          },
        ],
      },
    ],
  }
}

describe('applyDayGuardrails', () => {
  it('dia limpo: ok, sem notas', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140), input, targets)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.notes).toEqual([])
  })

  it('alérgeno: código ALLERGEN_IN_OUTPUT e feedback cita o alimento', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140, 'Pasta de amendoim'), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('ALLERGEN_IN_OUTPUT')
      expect(r.feedback).toContain('Pasta de amendoim')
      expect(r.feedback).toContain('REJEITADA')
    }
  })

  it('dia 30% acima da meta: reescalona e passa, com nota', () => {
    const r = applyDayGuardrails(buildDay(3, 2600, 182), input, targets)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.notes.some((n) => n.includes('reescalonado'))).toBe(true)
  })

  it('dia 3x a meta: clamp não basta → RECONCILE_FAILED', () => {
    const r = applyDayGuardrails(buildDay(3, 6000, 140), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('RECONCILE_FAILED')
  })

  it('refeições a menos: DAY_VALIDATION_FAILED', () => {
    const r = applyDayGuardrails(buildDay(3, 2000, 140), { ...input, meals_per_day: 4 }, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('DAY_VALIDATION_FAILED')
      expect(r.violations.map((v) => v.type)).toContain('MEAL_COUNT')
    }
  })

  it('alérgeno tem prioridade sobre os outros códigos', () => {
    const r = applyDayGuardrails(buildDay(3, 6000, 140, 'Amendoim'), input, targets)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('ALLERGEN_IN_OUTPUT')
  })

  it('proteína é validada DEPOIS do reescalonamento (não dá falso positivo)', () => {
    // 2600 kcal com 182 g → escala 0.77 → 2000 kcal com 140 g: dentro da meta.
    const r = applyDayGuardrails(buildDay(3, 2600, 182), input, targets)
    expect(r.ok).toBe(true)
  })

  it('fixItemCalories corrige o item ANTES do reconcile — é a correção que decide o veredito, não o dia bruto', () => {
    const r = applyDayGuardrails(buildDayWithIncoherentItem(), input, targets)
    // Ver aritmética no comentário de buildDayWithIncoherentItem: com o dia
    // bruto (6800 kcal) o resultado seria RECONCILE_FAILED; com o item
    // corrigido (2280 kcal) o dia reescalona dentro do clamp e passa.
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.notes.some((n) => n.includes('recalculada'))).toBe(true)
      expect(r.notes.some((n) => n.includes('reescalonado'))).toBe(true)
    }
  })
})
