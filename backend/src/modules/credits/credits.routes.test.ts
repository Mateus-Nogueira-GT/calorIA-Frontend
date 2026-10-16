import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import adminRoutes from '../admin/admin.routes.js'
import inviteRoutes from '../credit-invites/credit-invites.routes.js'
import creditsRoutes from './credits.routes.js'
const original = [env.CREDITS_ENFORCEMENT_ENABLED, env.CREDIT_INVITES_ENABLED]
afterEach(() => {
  ;[env.CREDITS_ENFORCEMENT_ENABLED, env.CREDIT_INVITES_ENABLED] = original
})
async function app(db = vi.fn().mockResolvedValue([])) {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  await f.register(jwt, { secret: 'only-test-secret-not-a-real-provider-key' })
  f.decorate('db', db)
  await f.register(creditsRoutes, { prefix: '/credits' })
  await f.register(adminRoutes, { prefix: '/admin' })
  await f.register(inviteRoutes, { prefix: '/credit-invites' })
  await f.ready()
  return f
}
describe('credit HTTP boundaries', () => {
  it('requires authentication for wallet', async () => {
    const f = await app()
    expect((await f.inject('/credits/me')).statusCode).toBe(401)
    await f.close()
  })
  it('disabled features return explicit status without DB wallet access', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = false
    env.CREDIT_INVITES_ENABLED = false
    const db = vi.fn().mockRejectedValue(Error('must not query'))
    const f = await app(db)
    const r = await f.inject({
      url: '/credits/me',
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'user' })}` },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      enforcement_enabled: false,
      invites_enabled: false,
      available_units: 0,
    })
    expect(db).not.toHaveBeenCalled()
    await f.close()
  })
  it('DB outage is503 and cannot masquerade as zero balance', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = false
    env.CREDIT_INVITES_ENABLED = true
    const f = await app(vi.fn().mockRejectedValue(Error('db down')))
    const r = await f.inject({
      url: '/credits/me',
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'user' })}` },
    })
    expect(r.statusCode).toBe(503)
    expect(r.json().error).toBe('CREDITS_UNAVAILABLE')
    expect(r.json()).not.toHaveProperty('balance_units')
    await f.close()
  })
  it('admin denied before issuing invite, and fail-closed on DB errors', async () => {
    env.CREDIT_INVITES_ENABLED = true
    for (const db of [
      vi.fn().mockResolvedValue([{ is_admin: false }]),
      vi.fn().mockRejectedValue(Error('db down')),
    ]) {
      const f = await app(db)
      const r = await f.inject({
        method: 'POST',
        url: '/admin/credit-invites',
        headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'user' })}` },
        payload: { label: 'client' },
      })
      expect(r.statusCode).toBe(404)
      expect(db).toHaveBeenCalledTimes(1)
      await f.close()
    }
  })
  it('admin emission requires validated idempotency key and feature flag', async () => {
    env.CREDIT_INVITES_ENABLED = true
    const db = vi.fn().mockResolvedValue([{ is_admin: true }])
    const f = await app(db)
    const request = {
      method: 'POST' as const,
      url: '/admin/credit-invites',
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'user' })}` },
      payload: { label: 'client' },
    }
    expect((await f.inject(request)).statusCode).toBe(400)
    env.CREDIT_INVITES_ENABLED = false
    expect((await f.inject(request)).statusCode).toBe(404)
    await f.close()
  })
  it('cancellation requires auth and disabled credits skip DB even with JSON empty body', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = false
    const db = vi.fn().mockRejectedValue(Error('must not access db'))
    const f = await app(db)
    const request = {
      method: 'POST' as const,
      url: '/credits/operations/by-key/abcdefghijklmnop/cancel',
      payload: {},
    }
    expect((await f.inject(request)).statusCode).toBe(401)
    const result = await f.inject({
      ...request,
      headers: { authorization: `Bearer ${f.jwt.sign({ sub: 'user' })}` },
    })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual({ state: 'disabled', operation_id: null })
    expect(db).not.toHaveBeenCalled()
    await f.close()
  })
  it('invite preview rejects invalid body and never claims on GET', async () => {
    const f = await app()
    expect(
      (
        await f.inject({
          method: 'POST',
          url: '/credit-invites/preview',
          payload: { token: 'bad' },
        })
      ).statusCode,
    ).toBe(400)
    expect((await f.inject('/credit-invites/redeem')).statusCode).toBe(404)
    await f.close()
  })
})
