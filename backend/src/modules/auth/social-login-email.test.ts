import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import authRoutes from './auth.routes.js'

/**
 * A9 do pente fino: Apple (e-mail oculto recusado) e Google podem devolver um
 * usuário sem e-mail. O service já mandava `email: ''`, mas o schema de resposta
 * exigia e-mail válido e a serialização virava 500.
 */
const USER_ID = '6f1c2a4e-1111-4222-8333-944455556666'
const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600 }
const user = { id: USER_ID, email: undefined, user_metadata: {} }

async function app() {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  f.decorate('db', vi.fn().mockResolvedValue([]) as never)
  f.decorate('supabaseAuth', {
    auth: {
      signInWithIdToken: vi.fn().mockResolvedValue({ data: { session, user }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session, user }, error: null }),
    },
  } as never)
  await f.register(authRoutes, { prefix: '/auth' })
  await f.ready()
  return f
}

describe('login social sem e-mail', () => {
  it.each([
    ['/auth/apple', { identityToken: 't' }],
    ['/auth/google', { idToken: 't' }],
    ['/auth/refresh', { refresh_token: 'r' }],
  ])('%s → 200 com email vazio', async (url, payload) => {
    const f = await app()
    const r = await f.inject({ method: 'POST', url, payload })
    expect(r.statusCode).toBe(200)
    expect(r.json().user).toEqual({ id: USER_ID, email: '', name: null })
    await f.close()
  })
})
