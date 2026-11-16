import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { type DbRoute, fakeFastify } from '../../shared/testing/fake-fastify.js'
import { loginUser } from './auth.service.js'

/** Supabase devolve { error } com code/status; o app precisa do motivo real. */
function withAuth(error: { code?: string; status?: number } | null, db: DbRoute[] = []) {
  const fake = fakeFastify(db)
  const f = fake.fastify as FastifyInstance
  ;(f as unknown as { supabaseAuth: unknown }).supabaseAuth = {
    auth: {
      signInWithPassword: async () =>
        error
          ? { data: { session: null, user: null }, error }
          : {
              data: {
                session: { access_token: 'a', refresh_token: 'r', expires_in: 3600 },
                user: { id: 'u1', email: 'ana@x.com', user_metadata: { name: 'Ana' } },
              },
              error: null,
            },
    },
  }
  return { f, ...fake }
}

const body = { email: 'rafael@x.com', password: 'senha-errada' }

describe('login: motivo da recusa', () => {
  it('senha errada em conta com senha → INVALID_CREDENTIALS', async () => {
    const { f, logs } = withAuth({ code: 'invalid_credentials', status: 400 }, [
      ['FROM auth.users', [{ has_password: true, providers: ['email'] }]],
    ])
    await expect(loginUser(f, body)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    })
    // Motivo registrado, sem o e-mail.
    const log = logs.find((l) => l.msg === 'login_failed')
    expect(log).toBeTruthy()
    expect(JSON.stringify(logs)).not.toContain('rafael@x.com')
  })

  it('conta criada pelo Google, sem senha → GOOGLE_LOGIN_ACCOUNT', async () => {
    const { f } = withAuth({ code: 'invalid_credentials', status: 400 }, [
      ['FROM auth.users', [{ has_password: false, providers: ['google'] }]],
    ])
    await expect(loginUser(f, body)).rejects.toMatchObject({
      statusCode: 401,
      code: 'GOOGLE_LOGIN_ACCOUNT',
    })
  })

  it('conta criada pela Apple, sem senha → APPLE_LOGIN_ACCOUNT', async () => {
    const { f } = withAuth({ code: 'invalid_credentials', status: 400 }, [
      ['FROM auth.users', [{ has_password: false, providers: ['apple'] }]],
    ])
    await expect(loginUser(f, body)).rejects.toMatchObject({ code: 'APPLE_LOGIN_ACCOUNT' })
  })

  it('e-mail inexistente ou falha na consulta → genérico, sem revelar nada', async () => {
    const inexistente = withAuth({ code: 'invalid_credentials', status: 400 }, [
      ['FROM auth.users', []],
    ])
    await expect(loginUser(inexistente.f, body)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    const quebrado = withAuth({ code: 'invalid_credentials', status: 400 }, [
      ['FROM auth.users', new Error('sem permissão')],
    ])
    await expect(loginUser(quebrado.f, body)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('e-mail não confirmado, muitas tentativas e Supabase fora do ar têm código próprio', async () => {
    await expect(
      loginUser(withAuth({ code: 'email_not_confirmed', status: 400 }).f, body),
    ).rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_NOT_CONFIRMED' })
    await expect(
      loginUser(withAuth({ code: 'over_request_rate_limit', status: 429 }).f, body),
    ).rejects.toMatchObject({ statusCode: 429, code: 'TOO_MANY_ATTEMPTS' })
    await expect(
      loginUser(withAuth({ code: 'unexpected_failure', status: 500 }).f, body),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AUTH_UNAVAILABLE' })
  })

  it('sucesso continua igual', async () => {
    const r = await loginUser(withAuth(null).f, body)
    expect(r.access_token).toBe('a')
  })
})
