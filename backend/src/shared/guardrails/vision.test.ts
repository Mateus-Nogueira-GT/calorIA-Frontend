import { describe, expect, it } from 'vitest'
import { sanitizeVisionResult } from './vision.js'

describe('sanitizeVisionResult (OP3)', () => {
  it('prato comum passa intacto e não é incerto', () => {
    const r = sanitizeVisionResult({
      calories: 650,
      protein: 40,
      carbs: 70,
      fat: 18,
      confidence: 0.82,
    })
    expect(r).toEqual({
      calories: 650,
      protein: 40,
      carbs: 70,
      fat: 18,
      confidence: 0.82,
      uncertain: false,
    })
  })

  it('kcal incoerente com macros (>25%) é recalculada', () => {
    // 4*40 + 4*70 + 9*18 = 602; 1200 está 50% acima
    const r = sanitizeVisionResult({
      calories: 1200,
      protein: 40,
      carbs: 70,
      fat: 18,
      confidence: 0.9,
    })
    expect(r.calories).toBe(602)
  })

  it('acima de 3000 kcal: clampa e escala os macros junto', () => {
    // macros coerentes com 40000 kcal
    const r = sanitizeVisionResult({
      calories: 40000,
      protein: 2000,
      carbs: 5000,
      fat: 1333,
      confidence: 0.9,
    })
    expect(r.calories).toBe(3000)
    expect(r.protein).toBe(150)
    expect(r.carbs).toBe(375)
    expect(r.fat).toBe(100)
  })

  it('negativos viram zero', () => {
    const r = sanitizeVisionResult({ calories: -5, protein: -1, carbs: 0, fat: 0, confidence: 0.7 })
    expect(r.calories).toBe(0)
    expect(r.protein).toBe(0)
  })

  it('confiança < 0.5 marca uncertain e clampa a [0, 1]', () => {
    expect(
      sanitizeVisionResult({ calories: 100, protein: 5, carbs: 10, fat: 2, confidence: 0.3 })
        .uncertain,
    ).toBe(true)
    expect(
      sanitizeVisionResult({ calories: 100, protein: 5, carbs: 10, fat: 2, confidence: 1.7 })
        .confidence,
    ).toBe(1)
  })
})
