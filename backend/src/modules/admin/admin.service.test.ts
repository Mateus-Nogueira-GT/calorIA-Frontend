import { describe, expect, it } from 'vitest'
import { successRate } from './admin.service.js'

describe('successRate (M4.2)', () => {
  it('sem jobs → 0 (nunca divide por zero)', () => {
    expect(successRate(0, 0)).toBe(0)
  })

  it('só sucessos → 1', () => {
    expect(successRate(10, 0)).toBe(1)
  })

  it('só falhas → 0', () => {
    expect(successRate(0, 4)).toBe(0)
  })

  it('arredonda a 2 casas', () => {
    // 2 / 3 = 0.6666...
    expect(successRate(2, 1)).toBe(0.67)
  })
})
