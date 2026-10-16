import { describe, expect, it } from 'vitest'
import { CREDIT_POLICY, creditsFromUnits } from './credit-policy.js'
describe('credit units', () => {
  it('uses exact integer units for fractional message consumption', () => {
    expect(creditsFromUnits(CREDIT_POLICY.welcome_units)).toBe(15)
    expect(creditsFromUnits(75 - 15 - 2)).toBe(11.6)
    expect(creditsFromUnits(1)).toBe(0.2)
  })
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0.2, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid wallet units %s',
    (units) => {
      expect(() => creditsFromUnits(units)).toThrow(RangeError)
    },
  )
})
