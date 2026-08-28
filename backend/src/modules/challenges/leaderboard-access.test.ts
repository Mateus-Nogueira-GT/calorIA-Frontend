import type { FastifyInstance } from 'fastify'
import { describe, expect, it } from 'vitest'
import { createChallengeBodySchema } from './challenges.schemas.js'
import { getLeaderboard } from './challenges.service.js'

/** Mock do template tagueado do postgres.js, devolvendo as linhas enfileiradas. */
function fakeFastify(queue: unknown[][]): FastifyInstance {
  const db = () => Promise.resolve(queue.shift() ?? [])
  return { db } as unknown as FastifyInstance
}

const USER = '11111111-1111-1111-1111-111111111111'
const CHALLENGE = '22222222-2222-2222-2222-222222222222'

describe('getLeaderboard — vínculo obrigatório (M4)', () => {
  it('recusa quem não participa de desafio privado', async () => {
    const fastify = fakeFastify([[{ is_public: false, is_member: false }]])

    // O ranking expõe nome e desempenho de todos os membros: qualquer usuário
    // autenticado com um id de desafio em mãos lia um grupo privado inteiro.
    await expect(getLeaderboard(fastify, USER, CHALLENGE)).rejects.toThrow(/não participa/i)
  })

  it('permite quem é membro ativo', async () => {
    const fastify = fakeFastify([
      [{ is_public: false, is_member: true }],
      [{ user_id: USER, full_name: 'Ana', username: 'ana', current_streak: 5 }],
    ])

    const rows = await getLeaderboard(fastify, USER, CHALLENGE)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ rank: 1, streak: 5, isMe: true })
  })

  it('permite desafio público mesmo sem ser membro', async () => {
    const fastify = fakeFastify([
      [{ is_public: true, is_member: false }],
      [{ user_id: 'outro', full_name: 'Bruno', username: 'bruno', current_streak: 2 }],
    ])

    const rows = await getLeaderboard(fastify, USER, CHALLENGE)

    expect(rows).toHaveLength(1)
    expect(rows[0].isMe).toBe(false)
  })

  it('404 quando o desafio não existe', async () => {
    const fastify = fakeFastify([[]])

    await expect(getLeaderboard(fastify, USER, CHALLENGE)).rejects.toThrow(/não encontrado/i)
  })
})

describe('createChallengeBodySchema — datas coerentes (L6)', () => {
  const base = { title: 'Sete dias', description: '', startDate: '2026-08-01' }

  it('recusa término anterior ao início', () => {
    // Nascia com ends_at no passado, ou seja, já encerrado.
    const result = createChallengeBodySchema.safeParse({ ...base, endDate: '2026-07-25' })
    expect(result.success).toBe(false)
  })

  it('aceita término igual ao início (desafio de um dia)', () => {
    const result = createChallengeBodySchema.safeParse({ ...base, endDate: '2026-08-01' })
    expect(result.success).toBe(true)
  })

  it('aceita o caso normal da UI (+7 dias)', () => {
    const result = createChallengeBodySchema.safeParse({ ...base, endDate: '2026-08-08' })
    expect(result.success).toBe(true)
  })
})
