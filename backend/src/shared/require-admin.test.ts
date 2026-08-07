import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { isAdminUser } from './require-admin.js'

/** Fastify falso cujo `db` (template tag) devolve as linhas informadas. */
function fakeFastify(rows: unknown[] | Error): FastifyInstance {
  const db = () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))
  return { db, log: { warn: vi.fn() } } as unknown as FastifyInstance
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
})
