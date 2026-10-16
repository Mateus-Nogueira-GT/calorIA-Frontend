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
it('real server preflight permits idempotent authenticated client requests', async () => {
  const app = await buildApp()
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/scanner/analyze',
    headers: {
      origin: 'http://localhost:8081',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,idempotency-key',
    },
  })
  expect(response.statusCode).toBe(204)
  expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toContain(
    'idempotency-key',
  )
  await app.close()
})
