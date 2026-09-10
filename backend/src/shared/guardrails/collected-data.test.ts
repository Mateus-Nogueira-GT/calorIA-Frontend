import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { collectedUserDataSchema } from '../diet-ai-schema.js'
import { assessSafety, bmi, describeInvalidFields } from './collected-data.js'

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

describe('describeInvalidFields (S4) — pergunta específica por campo', () => {
  const base = {
    weight_kg: 80,
    height_cm: 180,
    age: 30,
    gender: 'male',
    goal: 'maintain',
    activity_level: 'moderate',
    meals_per_day: 4,
    dietary_restrictions: [],
    allergies: [],
    food_preferences: null,
    message_to_user: 'ok',
    health_conditions: [],
  }
  function issuesFor(raw: unknown) {
    const r = collectedUserDataSchema.safeParse(raw)
    if (r.success) throw new Error('esperava falha')
    return r.error.issues
  }

  it('altura em metros: cita o valor e pede em centímetros', () => {
    const raw = { ...base, height_cm: 1.75 }
    const msg = describeInvalidFields(issuesFor(raw), raw)
    expect(msg).toContain('1.75')
    expect(msg).toMatch(/centímetros/)
  })

  it('peso implausível: pede confirmação em kg', () => {
    const raw = { ...base, weight_kg: 600 }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/600 kg/)
  })

  it('idade: pede confirmação', () => {
    const raw = { ...base, age: 140 }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/140 anos/)
  })

  it('lista longa: pede resumo', () => {
    const raw = { ...base, allergies: Array.from({ length: 11 }, (_, i) => `a${i}`) }
    expect(describeInvalidFields(issuesFor(raw), raw)).toMatch(/até 10/)
  })

  it('vários campos: junta as perguntas', () => {
    const raw = { ...base, height_cm: 1.75, weight_kg: 600 }
    const msg = describeInvalidFields(issuesFor(raw), raw)
    expect(msg).toContain('1.75')
    expect(msg).toContain('600')
  })

  it('campo sem template: mensagem genérica de peso/altura', () => {
    const issues: z.ZodIssue[] = [{ code: 'custom', path: ['gender'], message: 'x' }]
    expect(describeInvalidFields(issues, base)).toMatch(/confirmar seu peso e altura/)
  })
})
