import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createSocialUser,
  resetSocialSchema,
  socialTestDb,
  socialTestUrl,
} from '../../shared/testing/social-schema.js'
import { sendFriendRequest } from './friends.service.js'

/** R9 (26/11): pedido de amizade simultâneo dos dois lados, em PostgreSQL real. */
;(socialTestUrl ? describe : describe.skip)('amizades / corrida em PostgreSQL real', () => {
  const db = socialTestDb()
  const fastify = { db, log: { warn: () => {} } } as unknown as FastifyInstance
  const ana = randomUUID()
  const bruno = randomUUID()

  beforeAll(async () => {
    await resetSocialSchema(db)
    await createSocialUser(db, ana, 'Ana')
    await createSocialUser(db, bruno, 'Bruno')
  })
  afterAll(async () => {
    await db.end()
  })

  it('o pedido do Bruno ainda sem commit: o da Ana vira 409 REQUEST_INCOMING, sem 500', async () => {
    // O pedido do Bruno segura o commit: a checagem prévia da Ana não o vê, o
    // insert dela espera no UNIQUE (pair_key) e recebe 23505 quando ele commita.
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let inserted!: () => void
    const ready = new Promise<void>((r) => {
      inserted = r
    })
    const brunoRequest = db.begin(async (tx) => {
      await tx`INSERT INTO friendships (requester_id, addressee_id, status) VALUES (${bruno}, ${ana}, 'pending')`
      inserted()
      await gate
    })
    await ready
    const anaRequest = sendFriendRequest(fastify, ana, 'bruno').catch((e: unknown) => e)
    await new Promise((r) => setTimeout(r, 300))
    release()
    await brunoRequest
    expect(await anaRequest).toMatchObject({ statusCode: 409, code: 'REQUEST_INCOMING' })
    expect(await db`SELECT id FROM friendships`).toHaveLength(1)
  })
})
