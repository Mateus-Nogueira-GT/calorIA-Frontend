import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import authRoutes from './auth.routes.js'

/**
 * A4 do pente fino: /auth/register criava a conta já confirmada. Quem
 * cadastrasse o e-mail de outra pessoa ficava com a conta quando ela entrasse
 * depois pelo Google ou pela Apple. Com AUTH_REQUIRE_EMAIL_CONFIRMATION=true a
 * conta nasce sem confirmação e sem sessão; desligada, nada muda.
 */
const USER_ID = '6f1c2a4e-1111-4222-8333-944455556666'
const EMAIL = 'ana@example.com'
const body = { name: 'Ana', email: EMAIL, password: 'senha12345' }
const original = {
  flag: env.AUTH_REQUIRE_EMAIL_CONFIRMATION,
  redirect: env.AUTH_EMAIL_CONFIRMATION_REDIRECT_URL,
}
afterEach(() => {
  env.AUTH_REQUIRE_EMAIL_CONFIRMATION = original.flag
  env.AUTH_EMAIL_CONFIRMATION_REDIRECT_URL = original.redirect
})

async function app() {
  const sql: string[] = []
  const db = vi.fn((strings: TemplateStringsArray) => {
    sql.push(strings.join('?'))
    return Promise.resolve([])
  })
  const createUser = vi.fn().mockResolvedValue({
    data: { user: { id: USER_ID, email: EMAIL } },
    error: null,
  })
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: {
      session: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      user: { id: USER_ID, email: EMAIL, user_metadata: { name: 'Ana' } },
    },
    error: null,
  })
  const resend = vi.fn().mockResolvedValue({ data: {}, error: null })
  const logs: unknown[] = []
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  // Mesmo contrato do handler global do server.ts (AppError e validação).
  f.setErrorHandler((err, _req, reply) =>
    err instanceof AppError
      ? reply.status(err.statusCode).send({ error: err.code, message: err.message })
      : (err as { validation?: unknown }).validation
        ? reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'x' })
        : reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: String(err) }),
  )
  f.decorate('db', db as never)
  f.decorate('supabase', { auth: { admin: { createUser } } } as never)
  f.decorate('supabaseAuth', { auth: { signInWithPassword, resend } } as never)
  await f.register(authRoutes, { prefix: '/auth' })
  await f.ready()
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(f.log, level).mockImplementation(((obj: unknown, msg?: string) => {
      if (msg !== 'incoming request') logs.push({ obj, msg })
    }) as never)
  }
  return { f, sql, createUser, signInWithPassword, resend, logs }
}

const register = (f: Awaited<ReturnType<typeof app>>['f']) =>
  f.inject({ method: 'POST', url: '/auth/register', payload: body })
const resendRoute = (f: Awaited<ReturnType<typeof app>>['f'], email = EMAIL) =>
  f.inject({ method: 'POST', url: '/auth/resend-confirmation', payload: { email } })

describe('POST /auth/register com a flag desligada (padrão)', () => {
  it('o padrão do env é false', () => {
    expect(original.flag).toBe(false)
  })

  it('a resposta é idêntica à de hoje: conta confirmada e sessão', async () => {
    const ctx = await app()
    const r = await register(ctx.f)
    expect(r.statusCode).toBe(201)
    expect(r.json()).toEqual({
      access_token: 'acc',
      refresh_token: 'ref',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: USER_ID, email: EMAIL, name: 'Ana' },
    })
    expect(ctx.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: true }))
    expect(ctx.resend).not.toHaveBeenCalled()
    await ctx.f.close()
  })
})

describe('POST /auth/register com AUTH_REQUIRE_EMAIL_CONFIRMATION=true', () => {
  it('cria sem confirmar, dispara o e-mail e responde sem tokens', async () => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    env.AUTH_EMAIL_CONFIRMATION_REDIRECT_URL = 'https://app.example.com/confirmado'
    const ctx = await app()
    const r = await register(ctx.f)
    expect(r.statusCode).toBe(201)
    expect(r.json()).toEqual({ status: 'confirmation_required', email: EMAIL })
    expect(r.body).not.toContain('access_token')
    expect(ctx.createUser).toHaveBeenCalledWith(expect.objectContaining({ email_confirm: false }))
    expect(ctx.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: EMAIL,
      options: { emailRedirectTo: 'https://app.example.com/confirmado' },
    })
    expect(ctx.signInWithPassword).not.toHaveBeenCalled()
    // Perfil e username continuam; créditos de boas-vindas não (só no 1º acesso autenticado).
    expect(ctx.sql.some((q) => q.includes('INSERT INTO profiles'))).toBe(true)
    expect(ctx.sql.some((q) => /credit_/.test(q))).toBe(false)
    await ctx.f.close()
  })

  it('sem URL de redirecionamento, não manda options (o Supabase usa o Site URL)', async () => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    env.AUTH_EMAIL_CONFIRMATION_REDIRECT_URL = undefined
    const ctx = await app()
    await register(ctx.f)
    expect(ctx.resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL })
    await ctx.f.close()
  })

  it('falha no envio do e-mail não derruba o cadastro (o app oferece reenviar)', async () => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    const ctx = await app()
    ctx.resend.mockResolvedValueOnce({ data: null, error: { status: 429, message: 'rate' } })
    const r = await register(ctx.f)
    expect(r.statusCode).toBe(201)
    expect(r.json()).toEqual({ status: 'confirmation_required', email: EMAIL })
    expect(JSON.stringify(ctx.logs)).not.toContain(EMAIL)
    await ctx.f.close()
  })

  it('e-mail já cadastrado continua 409', async () => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    const ctx = await app()
    ctx.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    })
    const r = await register(ctx.f)
    expect(r.statusCode).toBe(409)
    expect(ctx.resend).not.toHaveBeenCalled()
    await ctx.f.close()
  })
})

describe('POST /auth/resend-confirmation', () => {
  it('flag ligada: reenvia e responde neutro', async () => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    const ctx = await app()
    const r = await resendRoute(ctx.f)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    expect(ctx.resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL })
    await ctx.f.close()
  })

  it.each([
    ['erro do Supabase', () => ({ data: null, error: { status: 400, message: 'not found' } })],
    ['e-mail já confirmado', () => ({ data: null, error: { status: 422, message: 'confirmed' } })],
  ])('flag ligada, %s: mesma resposta neutra, sem e-mail no log', async (_n, make) => {
    env.AUTH_REQUIRE_EMAIL_CONFIRMATION = true
    const ctx = await app()
    ctx.resend.mockResolvedValueOnce(make())
    const r = await resendRoute(ctx.f, 'outra@example.com')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    expect(JSON.stringify(ctx.logs)).not.toContain('outra@example.com')
    await ctx.f.close()
  })

  it('flag desligada: responde neutro sem chamar o Supabase', async () => {
    const ctx = await app()
    const r = await resendRoute(ctx.f)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    expect(ctx.resend).not.toHaveBeenCalled()
    await ctx.f.close()
  })

  it('e-mail inválido → 400', async () => {
    const ctx = await app()
    const r = await resendRoute(ctx.f, 'nao-e-email')
    expect(r.statusCode).toBe(400)
    expect(ctx.resend).not.toHaveBeenCalled()
    await ctx.f.close()
  })
})
