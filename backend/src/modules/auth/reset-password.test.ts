import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import authRoutes from './auth.routes.js'

/**
 * A5 do pente fino: /auth/reset-password aceitava QUALQUER access token válido,
 * não só o da sessão de recuperação do link do e-mail. Quem pegasse um token
 * de sessão (aparelho emprestado, log vazado) trocava a senha e tomava a conta.
 * Modo `log` (padrão) só registra o formato do `amr`; `enforce` exige a
 * entrada de recuperação recente.
 */
const USER_ID = '6f1c2a4e-1111-4222-8333-944455556666'
const original = env.AUTH_RESET_REQUIRE_RECOVERY
afterEach(() => {
  env.AUTH_RESET_REQUIRE_RECOVERY = original
})

const now = () => Math.floor(Date.now() / 1000)
function jwt(payload: Record<string, unknown>): string {
  const b = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url')
  return `${b({ alg: 'ES256', typ: 'JWT' })}.${b({ sub: USER_ID, email: 'ana@x.com', ...payload })}.assinatura`
}

async function app() {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null })
  const signOut = vi.fn().mockResolvedValue({ data: null, error: null })
  const logs: { obj: unknown; msg?: string }[] = []
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  // Mesmo contrato do handler global do server.ts para AppError.
  f.setErrorHandler((err, _req, reply) =>
    err instanceof AppError
      ? reply.status(err.statusCode).send({ error: err.code, message: err.message })
      : reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'x' }),
  )
  f.decorate('supabaseAuth', { auth: { getUser } } as never)
  f.decorate('supabase', { auth: { admin: { updateUserById, signOut } } } as never)
  await f.register(authRoutes, { prefix: '/auth' })
  await f.ready()
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(f.log, level).mockImplementation(((obj: unknown, msg?: string) => {
      logs.push({ obj, msg })
    }) as never)
  }
  const reset = (token: string) =>
    f.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { access_token: token, new_password: 'senhaNova123' },
    })
  return { f, reset, getUser, updateUserById, signOut, logs }
}

const recovery = (age = 60) => jwt({ amr: [{ method: 'recovery', timestamp: now() - age }] })
const passwordSession = () => jwt({ amr: [{ method: 'password', timestamp: now() - 60 }] })

describe('POST /auth/reset-password: modo log (padrão)', () => {
  it('o padrão do env é log', () => {
    expect(original).toBe('log')
  })

  it.each([
    ['sessão de senha', passwordSession],
    ['sem amr', () => jwt({})],
    ['amr em strings', () => jwt({ amr: ['password'] })],
  ])('%s não é rejeitada; o log diz que seria', async (_n, make) => {
    const { f, reset, updateUserById, logs } = await app()
    const token = make()
    const r = await reset(token)
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    expect(updateUserById).toHaveBeenCalledWith(USER_ID, { password: 'senhaNova123' })
    const entry = logs.find((l) => l.msg === 'reset_password_recovery_check')
    expect(entry).toBeDefined()
    expect(
      (entry?.obj as { reset_recovery: { would_reject: boolean } }).reset_recovery.would_reject,
    ).toBe(true)
    // Nada de token, e-mail ou id no log.
    // (o log de requisição do próprio Fastify fica de fora: no pino real ele só
    // serializa método e URL; aqui o spy recebe o objeto cru).
    const dump = JSON.stringify(logs.filter((l) => l.msg !== 'incoming request'))
    expect(dump).not.toContain(token)
    expect(dump).not.toContain('ana@x.com')
    expect(dump).not.toContain(USER_ID)
    await f.close()
  })

  it('sessão de recuperação recente: o log diz que passaria', async () => {
    const { f, reset, logs } = await app()
    expect((await reset(recovery())).statusCode).toBe(200)
    const entry = logs.find((l) => l.msg === 'reset_password_recovery_check')
    expect(entry?.obj).toMatchObject({
      reset_recovery: {
        mode: 'log',
        amr_format: 'objects',
        methods: ['recovery'],
        would_reject: false,
      },
    })
    await f.close()
  })
})

describe('POST /auth/reset-password: modo enforce', () => {
  it.each([
    ['sessão de senha', passwordSession],
    ['sem amr', () => jwt({})],
    ['amr em strings, sem timestamp', () => jwt({ amr: ['recovery'] })],
    ['recuperação com mais de 1 h', () => recovery(3601)],
  ])('%s → 401 INVALID_RESET_TOKEN, senha intacta', async (_n, make) => {
    env.AUTH_RESET_REQUIRE_RECOVERY = 'enforce'
    const { f, reset, updateUserById, signOut } = await app()
    const r = await reset(make())
    expect(r.statusCode).toBe(401)
    expect(r.json().error).toBe('INVALID_RESET_TOKEN')
    expect(updateUserById).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    await f.close()
  })

  it.each([
    ['recovery', recovery],
    ['otp', () => jwt({ amr: [{ method: 'otp', timestamp: now() - 30 }] })],
  ])('amr %s recente passa', async (_n, make) => {
    env.AUTH_RESET_REQUIRE_RECOVERY = 'enforce'
    const { f, reset, updateUserById } = await app()
    expect((await reset(make())).statusCode).toBe(200)
    expect(updateUserById).toHaveBeenCalled()
    await f.close()
  })
})

describe('POST /auth/reset-password: outras sessões', () => {
  it('depois de trocar a senha encerra as outras sessões', async () => {
    const { f, reset, signOut } = await app()
    const token = recovery()
    expect((await reset(token)).statusCode).toBe(200)
    expect(signOut).toHaveBeenCalledWith(token, 'others')
    await f.close()
  })

  it.each([
    ['devolve erro', () => vi.fn().mockResolvedValue({ data: null, error: { status: 500 } })],
    ['lança', () => vi.fn().mockRejectedValue(new Error('rede fora'))],
  ])('signOut que %s não muda a resposta', async (_n, make) => {
    const ctx = await app()
    ;(ctx.f.supabase.auth.admin as unknown as { signOut: unknown }).signOut = make()
    const r = await ctx.reset(recovery())
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    await ctx.f.close()
  })

  it('falha na troca de senha não encerra sessões', async () => {
    const ctx = await app()
    ctx.updateUserById.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect((await ctx.reset(recovery())).statusCode).toBe(500)
    expect(ctx.signOut).not.toHaveBeenCalled()
    await ctx.f.close()
  })
})
