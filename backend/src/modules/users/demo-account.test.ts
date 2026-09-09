import { describe, expect, it, vi } from 'vitest'
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
