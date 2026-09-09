import { describe, expect, it } from 'vitest'
import { assessSafety, bmi } from './collected-data.js'

const adulto = {
  age: 30,
  weight_kg: 70,
  height_cm: 175,
  goal: 'lose_weight' as const,
  health_conditions: [] as string[],
}

describe('bmi', () => {
  it('70 kg / 175 cm → 22.9', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 2)
  })
})

describe('assessSafety (S2) — ordem: menor → condição → IMC baixo+déficit → IMC alto', () => {
  it('adulto saudável, IMC normal: ok sem aviso', () => {
    expect(assessSafety(adulto)).toEqual({ ok: true, warning: null, warningMessage: null })
  })

  it('menor de 18 é recusado antes de qualquer outra regra', () => {
    const r = assessSafety({ ...adulto, age: 17, health_conditions: ['diabetes'] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('MINOR')
      expect(r.userMessage).toMatch(/menos de 18/)
    }
  })

  it('condição de saúde: recusa e cita a condição na mensagem', () => {
    const r = assessSafety({ ...adulto, health_conditions: ['gestante'] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('HEALTH_CONDITION')
      expect(r.userMessage).toContain('gestante')
      expect(r.userMessage).toMatch(/nutricionista ou médico/)
    }
  })

  it('IMC 18.4 + perder peso: recusa o déficit e oferece manutenção', () => {
    // 50 kg / 165 cm = 18.37
    const r = assessSafety({ ...adulto, weight_kg: 50, height_cm: 165, goal: 'lose_weight' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('UNDERWEIGHT_DEFICIT')
      expect(r.userMessage).toMatch(/MANUTENÇÃO/)
    }
  })

  it('IMC 18.4 + manter peso: ok (só o déficit é bloqueado)', () => {
    const r = assessSafety({ ...adulto, weight_kg: 50, height_cm: 165, goal: 'maintain' })
    expect(r.ok).toBe(true)
  })

  it('IMC exatamente 18.5 + perder peso: ok (limite é exclusivo)', () => {
    // 18.5 * 1.65^2 = 50.36 kg
    const r = assessSafety({ ...adulto, weight_kg: 50.4, height_cm: 165, goal: 'lose_weight' })
    expect(r.ok).toBe(true)
  })

  it('IMC 40.1: gera com aviso HIGH_BMI', () => {
    // 110 kg / 165 cm = 40.4
    const r = assessSafety({ ...adulto, weight_kg: 110, height_cm: 165 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.warning).toBe('HIGH_BMI')
      expect(r.warningMessage).toMatch(/acompanhamento médico/)
    }
  })

  it('IMC exatamente 40: sem aviso (limite é exclusivo)', () => {
    // 40 * 1.65^2 = 108.9
    const r = assessSafety({ ...adulto, weight_kg: 108.9, height_cm: 165 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.warning).toBeNull()
  })
})
