import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { sendFriendRequest } from './friends.service.js'

const ME = '11111111-1111-1111-1111-111111111111'
const ANA = '22222222-2222-2222-2222-222222222222'
const FRIENDSHIP = '33333333-3333-3333-3333-333333333333'

const TARGET = 'FROM profiles WHERE username'
const EXISTING = 'SELECT id, status, requester_id FROM friendships'

function pairConflict() {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint_name: 'friendships_pair_key_key',
  })
}

describe('sendFriendRequest — pedido simultâneo dos dois lados (R9)', () => {
  it('23505 no insert (o outro lado pediu ao mesmo tempo) vira 409 REQUEST_INCOMING', async () => {
    let reads = 0
    const { fastify } = fakeFastify([
      [TARGET, [{ id: ANA }]],
      // Antes do insert não havia nada; depois do conflito, o pedido da Ana.
      [
        EXISTING,
        () => (reads++ === 0 ? [] : [{ id: FRIENDSHIP, status: 'pending', requester_id: ANA }]),
      ],
      ['INSERT INTO friendships', pairConflict()],
    ])
    await expect(sendFriendRequest(fastify, ME, 'ana')).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_INCOMING',
    })
  })

  it('23505 com o meu próprio pedido já gravado (toque duplo) vira 409 REQUEST_PENDING', async () => {
    let reads = 0
    const { fastify } = fakeFastify([
      [TARGET, [{ id: ANA }]],
      [
        EXISTING,
        () => (reads++ === 0 ? [] : [{ id: FRIENDSHIP, status: 'pending', requester_id: ME }]),
      ],
      ['INSERT INTO friendships', pairConflict()],
    ])
    await expect(sendFriendRequest(fastify, ME, 'ana')).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_PENDING',
    })
  })

  it('23505 sem linha para reler continua 409, nunca 500', async () => {
    const { fastify } = fakeFastify([
      [TARGET, [{ id: ANA }]],
      [EXISTING, []],
      ['INSERT INTO friendships', pairConflict()],
    ])
    await expect(sendFriendRequest(fastify, ME, 'ana')).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_PENDING',
    })
  })

  it('a checagem prévia usa o mesmo mapeamento: pedido pendente vindo da Ana → REQUEST_INCOMING', async () => {
    const { fastify, calls } = fakeFastify([
      [TARGET, [{ id: ANA }]],
      [EXISTING, [{ id: FRIENDSHIP, status: 'pending', requester_id: ANA }]],
    ])
    await expect(sendFriendRequest(fastify, ME, 'ana')).rejects.toMatchObject({
      statusCode: 409,
      code: 'REQUEST_INCOMING',
    })
    expect(calls.some((c) => c.sql.includes('INSERT INTO friendships'))).toBe(false)
  })

  it('amizade aceita e bloqueio mantêm os códigos de hoje', async () => {
    for (const [status, code] of [
      ['accepted', 'ALREADY_FRIENDS'],
      ['blocked', 'BLOCKED'],
    ]) {
      const { fastify } = fakeFastify([
        [TARGET, [{ id: ANA }]],
        [EXISTING, [{ id: FRIENDSHIP, status, requester_id: ANA }]],
      ])
      await expect(sendFriendRequest(fastify, ME, 'ana')).rejects.toMatchObject({ code })
    }
  })

  it('sem conflito, cria o pedido como antes', async () => {
    const { fastify } = fakeFastify([
      [TARGET, [{ id: ANA }]],
      [EXISTING, []],
      ['INSERT INTO friendships', [{ id: FRIENDSHIP }]],
    ])
    await expect(sendFriendRequest(fastify, ME, 'ana')).resolves.toEqual({ id: FRIENDSHIP })
  })
})
