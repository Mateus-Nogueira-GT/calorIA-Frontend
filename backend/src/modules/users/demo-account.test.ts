import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { assertNotDemoAccount, deleteUserAccount } from './users.service.js'

/**
 * AP1: o revisor da Apple testa o fluxo de exclusão de conta (guideline
 * 5.1.1(v) o exige). Sem esta trava ele apagaria a própria conta demo, e a
 * submissão seguinte voltaria com "demo account does not work".
 */
describe('assertNotDemoAccount (AP1)', () => {
  it('conta demo é recusada com 403 DEMO_ACCOUNT_PROTECTED', () => {
    try {
      assertNotDemoAccount({ is_demo: true })
      expect.unreachable('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).statusCode).toBe(403)
      expect((err as AppError).code).toBe('DEMO_ACCOUNT_PROTECTED')
    }
  })

  it('conta comum passa', () => {
    expect(() => assertNotDemoAccount({ is_demo: false })).not.toThrow()
  })

  it('perfil inexistente não bloqueia (segue o fluxo normal de exclusão)', () => {
    expect(() => assertNotDemoAccount(undefined)).not.toThrow()
  })
})

function fakeFastify(isDemo: boolean) {
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  const remove = vi.fn().mockResolvedValue({})
  return {
    fastify: {
      db: vi.fn().mockResolvedValue([{ is_demo: isDemo }]),
      supabase: {
        auth: { admin: { deleteUser } },
        storage: { from: () => ({ list: vi.fn().mockResolvedValue({ data: [] }), remove }) },
      },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    },
    deleteUser,
  }
}

describe('deleteUserAccount (AP1)', () => {
  it('NÃO apaga o usuário quando a conta é demo', async () => {
    const { fastify, deleteUser } = fakeFastify(true)

    await expect(deleteUserAccount(fastify as never, 'u1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'DEMO_ACCOUNT_PROTECTED',
    })
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('apaga normalmente uma conta comum', async () => {
    const { fastify, deleteUser } = fakeFastify(false)

    await deleteUserAccount(fastify as never, 'u1')

    expect(deleteUser).toHaveBeenCalledWith('u1')
  })
})

describe('deleteUserAccount com assinatura (spec 2026-11-09)', () => {
  const original = { enabled: env.SUBSCRIPTIONS_ENABLED, key: env.ASAAS_API_KEY }
  afterEach(() => {
    env.SUBSCRIPTIONS_ENABLED = original.enabled
    env.ASAAS_API_KEY = original.key
    vi.restoreAllMocks()
  })

  function withSubscription() {
    const base = fakeFastify(false)
    base.fastify.db = vi.fn((strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('?').includes('FROM subscriptions')
          ? [
              {
                id: 's1',
                plan_id: 'p1',
                status: 'active',
                asaas_subscription_id: 'sub_1',
                entitled: true,
              },
            ]
          : [{ is_demo: false }],
      ),
    ) as never
    return base
  }

  it('cancela a assinatura no Asaas antes de apagar a conta', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    env.ASAAS_API_KEY = 'chave-teste'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"deleted":true}', { status: 200 }))
    const { fastify, deleteUser } = withSubscription()
    await deleteUserAccount(fastify as never, 'u1')
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/subscriptions/sub_1')
    expect(fetchSpy.mock.calls[0][1]?.method).toBe('DELETE')
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('falha no Asaas não impede a exclusão', async () => {
    env.SUBSCRIPTIONS_ENABLED = true
    env.ASAAS_API_KEY = 'chave-teste'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede fora'))
    const { fastify, deleteUser } = withSubscription()
    await deleteUserAccount(fastify as never, 'u1')
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('flag desligada: não consulta assinatura', async () => {
    env.SUBSCRIPTIONS_ENABLED = false
    const { fastify } = withSubscription()
    await deleteUserAccount(fastify as never, 'u1')
    const sqls = (
      fastify.db as unknown as { mock: { calls: [TemplateStringsArray][] } }
    ).mock.calls.map((c) => c[0].join('?'))
    expect(sqls.some((s) => s.includes('FROM subscriptions'))).toBe(false)
  })
})
