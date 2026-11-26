import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { describe, expect, it, vi } from 'vitest'
import authRoutes from './auth.routes.js'

/**
 * A6 do pente fino: o logout era só local. O refresh token continuava válido
 * no Supabase, então quem o copiasse seguia renovando a sessão.
 */
async function app(signOut: ReturnType<typeof vi.fn>) {
  const f = Fastify()
  f.setValidatorCompiler(validatorCompiler)
  f.setSerializerCompiler(serializerCompiler)
  f.decorate('supabase', { auth: { admin: { signOut } } } as never)
  await f.register(authRoutes, { prefix: '/auth' })
  await f.ready()
  return f
}

const logout = (f: Awaited<ReturnType<typeof app>>, headers: Record<string, string> = {}) =>
  f.inject({ method: 'POST', url: '/auth/logout', headers })

describe('POST /auth/logout', () => {
  it('com bearer revoga só esta sessão no Supabase', async () => {
    const signOut = vi.fn().mockResolvedValue({ data: null, error: null })
    const f = await app(signOut)
    const r = await logout(f, { authorization: 'Bearer jwt-da-sessao' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    expect(signOut).toHaveBeenCalledWith('jwt-da-sessao', 'local')
    await f.close()
  })

  it('sem bearer não chama o Supabase', async () => {
    const signOut = vi.fn()
    const f = await app(signOut)
    const r = await logout(f)
    expect(r.statusCode).toBe(200)
    expect(signOut).not.toHaveBeenCalled()
    await f.close()
  })

  it.each([
    ['devolve erro', () => vi.fn().mockResolvedValue({ data: null, error: { status: 401 } })],
    ['lança', () => vi.fn().mockRejectedValue(new Error('rede fora'))],
  ])('signOut que %s não muda a resposta', async (_n, make) => {
    const f = await app(make())
    const r = await logout(f, { authorization: 'Bearer vencido' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ success: true })
    await f.close()
  })
})
