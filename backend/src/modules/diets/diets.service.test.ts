import { describe, expect, it } from 'vitest'
import { toPlannedMealType } from './diets.service.js'

describe('toPlannedMealType (6 tipos do banco -> 4 do app)', () => {
  it('mantém breakfast/lunch/dinner', () => {
    expect(toPlannedMealType('breakfast')).toBe('breakfast')
    expect(toPlannedMealType('lunch')).toBe('lunch')
    expect(toPlannedMealType('dinner')).toBe('dinner')
  })

  it('lanches e ceia viram snack', () => {
    expect(toPlannedMealType('morning_snack')).toBe('snack')
    expect(toPlannedMealType('afternoon_snack')).toBe('snack')
    expect(toPlannedMealType('supper')).toBe('snack')
  })

  it('valor desconhecido cai em snack (não quebra a UI)', () => {
    expect(toPlannedMealType('other')).toBe('snack')
  })
})
