import fp from 'fastify-plugin'
import { expect, it, vi } from 'vitest'
vi.mock('../plugins/db.js', () => ({
  default: fp(async (app) => {
    app.decorate('db', vi.fn().mockResolvedValue([]))
  }),
}))
vi.mock('../plugins/openai.js', () => ({ default: fp(async () => {}) }))
vi.mock('../plugins/supabase.js', () => ({ default: fp(async () => {}) }))
import { buildApp } from '../server.js'

// A2 do pente fino: o errorResponseBuilder devolvia um objeto sem statusCode e
// o handler global respondia 500 a quem passava do limite.
it('passar do limite de /auth/login responde 429 TOO_MANY_REQUESTS, não 500', async () => {
  const app = await buildApp()
  const codes: number[] = []
  let last: { error?: string } = {}
  for (let i = 0; i < 12; i++) {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
      remoteAddress: '203.0.113.7',
    })
    codes.push(r.statusCode)
    last = r.json()
  }
  expect(codes.slice(0, 10).every((c) => c !== 429 && c < 500)).toBe(true)
  expect(codes.slice(10)).toEqual([429, 429])
  expect(last.error).toBe('TOO_MANY_REQUESTS')
  await app.close()
})
