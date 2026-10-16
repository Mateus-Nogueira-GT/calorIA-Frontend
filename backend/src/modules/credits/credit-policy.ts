export const CREDIT_POLICY = Object.freeze({
  version: '2026-10-15-v1',
  units_per_credit: 5,
  photo_units: 15,
  message_units: 1,
  welcome_units: 75,
})
export function creditsFromUnits(units: number): number {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new RangeError('Credit units must be nonnegative safe integers')
  return units / CREDIT_POLICY.units_per_credit
}
