import { describe, expect, it } from 'vitest'
import { updateProfileBodySchema } from './users.schemas.js'
describe('profile permissions are response-only', () => {
  it('rejects admin promotion mixed with valid profile fields', () => {
    expect(updateProfileBodySchema.safeParse({ full_name: 'Rafael', is_admin: true }).success).toBe(
      false,
    )
    expect(
      updateProfileBodySchema.safeParse({ full_name: 'Rafael', is_admin: false }).success,
    ).toBe(false)
    expect(updateProfileBodySchema.safeParse({ full_name: 'Rafael' }).success).toBe(true)
  })
})
