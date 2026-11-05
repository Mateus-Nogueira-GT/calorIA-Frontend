import { describe, expect, it } from 'vitest'
import { replaceDietItemBodySchema } from './diets.schemas.js'

// 05/11 (M11): a troca de item aceitava 999.999 kcal — mesma família do feedback de 27/10.
describe('replaceDietItemBodySchema', () => {
  const ok = {
    food_name: 'Batata-doce',
    quantity_g: 150,
    calories: 129,
    protein_g: 2.4,
    carbs_g: 30,
    fat_g: 0.2,
  }

  it('aceita um item normal', () => {
    expect(replaceDietItemBodySchema.safeParse(ok).success).toBe(true)
  })

  it.each([
    ['calories', 999_999],
    ['protein_g', 999_999],
    ['carbs_g', 501],
    ['fat_g', 501],
    ['quantity_g', 5001],
  ])('recusa %s = %d', (field, value) => {
    expect(replaceDietItemBodySchema.safeParse({ ...ok, [field]: value }).success).toBe(false)
  })

  it('recusa nome gigante', () => {
    expect(replaceDietItemBodySchema.safeParse({ ...ok, food_name: 'x'.repeat(121) }).success).toBe(
      false,
    )
  })
})
