import { describe, expect, it } from 'vitest'
import { createChallengeBodySchema } from './challenges.schemas.js'

const base = { title: 'Desafio', startDate: '2026-10-28' }

describe('createChallengeBodySchema — duração plausível', () => {
  it('7 e 90 dias passam', () => {
    expect(createChallengeBodySchema.safeParse({ ...base, endDate: '2026-11-04' }).success).toBe(
      true,
    )
    expect(createChallengeBodySchema.safeParse({ ...base, endDate: '2027-01-26' }).success).toBe(
      true,
    )
  })

  it('terminar em 2099 não passa', () => {
    const r = createChallengeBodySchema.safeParse({ ...base, endDate: '2099-12-31' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Um desafio dura no máximo 90 dias')
  })
})
