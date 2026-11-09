import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { createPlan, listActivePlans, updatePlan } from './plans.service.js'
import { createPlanBodySchema, updatePlanBodySchema } from './subscriptions.schemas.js'

const PLAN_ID = '33333333-3333-3333-3333-333333333333'

describe('schemas de plano', () => {
  const base = { code: 'pro', name: 'Pro', price_cents: 2990, cycle: 'MONTHLY' }

  it('exige créditos por ciclo ou ilimitado', () => {
    expect(createPlanBodySchema.safeParse(base).success).toBe(false)
    expect(createPlanBodySchema.safeParse({ ...base, credits_per_cycle: 100 }).success).toBe(true)
    expect(createPlanBodySchema.safeParse({ ...base, unlimited: true }).success).toBe(true)
  })

  it('limites de preço, ciclo e código', () => {
    const ok = { ...base, unlimited: true }
    for (const bad of [
      { price_cents: 99 },
      { price_cents: 1_000_001 },
      { price_cents: 29.9 },
      { cycle: 'WEEKLY' },
      { code: 'Pro' },
      { code: 'p' },
    ])
      expect(createPlanBodySchema.safeParse({ ...ok, ...bad }).success).toBe(false)
  })

  it('edição não aceita trocar o código nem corpo vazio', () => {
    expect(updatePlanBodySchema.safeParse({ code: 'outro' }).success).toBe(false)
    expect(updatePlanBodySchema.safeParse({}).success).toBe(false)
    expect(updatePlanBodySchema.safeParse({ price_cents: 3990 }).success).toBe(true)
  })
})

describe('serviço de planos', () => {
  it('lista só os ativos, sem campos internos', async () => {
    const { fastify, calls } = fakeFastify([
      ['FROM subscription_plans WHERE active', [{ code: 'pro', name: 'Pro' }]],
    ])
    expect([...(await listActivePlans(fastify))]).toEqual([{ code: 'pro', name: 'Pro' }])
    expect(calls[0].sql).not.toContain('*')
  })

  it('código repetido → 409', async () => {
    const dup = Object.assign(new Error('dup'), { code: '23505' })
    const { fastify } = fakeFastify([['INSERT INTO subscription_plans', dup]])
    const body = createPlanBodySchema.parse({
      code: 'pro',
      name: 'Pro',
      price_cents: 2990,
      cycle: 'MONTHLY',
      unlimited: true,
    })
    await expect(createPlan(fastify, body)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_CODE_TAKEN',
    })
  })

  it('edição: campo ausente fica, null explícito limpa; plano inexistente → 404', async () => {
    const { fastify, calls } = fakeFastify([['UPDATE subscription_plans', [{ id: PLAN_ID }]]])
    await updatePlan(fastify, PLAN_ID, { credits_per_cycle: null, unlimited: true })
    const params = calls[0].params
    // has('description') = false, has('credits_per_cycle') = true
    expect(params).toContain(false)
    expect(params).toContain(true)

    const vazio = fakeFastify([['UPDATE subscription_plans', []]])
    await expect(updatePlan(vazio.fastify, PLAN_ID, { name: 'X' })).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('edição que tira o último benefício → 422', async () => {
    const check = Object.assign(new Error('check'), { code: '23514' })
    const { fastify } = fakeFastify([['UPDATE subscription_plans', check]])
    await expect(updatePlan(fastify, PLAN_ID, { unlimited: false })).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_PLAN',
    })
  })
})
