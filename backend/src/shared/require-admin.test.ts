import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { isAdminUser, registerAdminGuard } from './require-admin.js'

/** Fastify falso cujo `db` (template tag) devolve as linhas informadas. */
function fakeFastify(rows: unknown[] | Error): FastifyInstance {
  const db = () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))
  return { db, log: { warn: vi.fn() } } as unknown as FastifyInstance
}

/** Reply falso com status/send encadeáveis. */
function fakeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply
}

/** Request falso sem user. */
function fakeRequest(user?: unknown): FastifyRequest {
  return { user } as unknown as FastifyRequest
}

describe('isAdminUser', () => {
  it('true quando o perfil tem is_admin', async () => {
    await expect(isAdminUser(fakeFastify([{ is_admin: true }]), 'u1')).resolves.toBe(true)
  })

  it('false quando o perfil não é admin', async () => {
    await expect(isAdminUser(fakeFastify([{ is_admin: false }]), 'u1')).resolves.toBe(false)
  })

  it('false quando o usuário não existe', async () => {
    await expect(isAdminUser(fakeFastify([]), 'fantasma')).resolves.toBe(false)
  })

  it('fail-closed: erro de banco vira false (nunca libera por falha)', async () => {
    await expect(isAdminUser(fakeFastify(new Error('db down')), 'u1')).resolves.toBe(false)
  })

  it('false quando a linha existe mas is_admin está ausente', async () => {
    await expect(isAdminUser(fakeFastify([{}]), 'u1')).resolves.toBe(false)
  })

  it('false quando is_admin é null', async () => {
    await expect(isAdminUser(fakeFastify([{ is_admin: null }]), 'u1')).resolves.toBe(false)
  })
})

describe('registerAdminGuard', () => {
  it('responde 404 quando request.user está ausente', async () => {
    let capturedHandler: Function | null = null
    const mockFastify = {
      addHook: (_evt: string, fn: Function) => {
        capturedHandler = fn
      },
      db: () => Promise.resolve([]),
      log: { warn: vi.fn() },
    } as unknown as FastifyInstance

    registerAdminGuard(mockFastify)
    expect(capturedHandler).toBeDefined()

    const request = fakeRequest(undefined)
    const reply = fakeReply()

    await capturedHandler!(request, reply)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      error: 'NOT_FOUND',
      message: 'Recurso não encontrado',
    })
  })

  it('responde 404 quando sub está ausente em request.user', async () => {
    let capturedHandler: Function | null = null
    const mockFastify = {
      addHook: (_evt: string, fn: Function) => {
        capturedHandler = fn
      },
      db: () => Promise.resolve([]),
      log: { warn: vi.fn() },
    } as unknown as FastifyInstance

    registerAdminGuard(mockFastify)
    expect(capturedHandler).toBeDefined()

    const request = fakeRequest({})
    const reply = fakeReply()

    await capturedHandler!(request, reply)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      error: 'NOT_FOUND',
      message: 'Recurso não encontrado',
    })
  })
})
