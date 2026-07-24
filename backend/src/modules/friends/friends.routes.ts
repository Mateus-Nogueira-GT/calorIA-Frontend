import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  errorSchema,
  friendRequestSchema,
  friendSchema,
  respondFriendRequestBodySchema,
  searchUsersQuerySchema,
  sendFriendRequestBodySchema,
  userSearchResultSchema,
} from './friends.schemas.js'
import {
  listFriends,
  listPendingRequests,
  removeFriendship,
  respondFriendRequest,
  searchUsers,
  sendFriendRequest,
} from './friends.service.js'

const friendsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Token inválido ou ausente.' })
    }
  })

  /** GET /friends — lista de amigos aceitos */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Lista de amigos',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(friendSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await listFriends(fastify, userId))
    },
  )

  /** GET /friends/requests — pedidos pendentes (recebidos e enviados) */
  fastify.get(
    '/requests',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Pedidos de amizade pendentes',
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            incoming: z.array(friendRequestSchema),
            outgoing: z.array(friendRequestSchema),
          }),
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await listPendingRequests(fastify, userId))
    },
  )

  /** GET /friends/search — buscar usuários por username/nome */
  fastify.get(
    '/search',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Buscar usuários',
        security: [{ bearerAuth: [] }],
        querystring: searchUsersQuerySchema,
        response: { 200: z.array(userSearchResultSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await searchUsers(fastify, userId, request.query.query))
    },
  )

  /** POST /friends/requests — enviar pedido de amizade */
  fastify.post(
    '/requests',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Enviar pedido de amizade',
        security: [{ bearerAuth: [] }],
        body: sendFriendRequestBodySchema,
        response: {
          201: z.object({ id: z.string().uuid() }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const created = await sendFriendRequest(fastify, userId, request.body.username)
      return reply.status(201).send(created)
    },
  )

  /** PATCH /friends/requests/:id — aceitar ou rejeitar pedido */
  fastify.patch(
    '/requests/:id',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Responder pedido de amizade',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: respondFriendRequestBodySchema,
        response: {
          200: z.object({ status: z.string() }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(
        await respondFriendRequest(fastify, userId, request.params.id, request.body.action),
      )
    },
  )

  /** DELETE /friends/:id — remover amizade ou cancelar pedido */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Friends'],
        summary: 'Remover amizade / cancelar pedido',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      await removeFriendship(fastify, userId, request.params.id)
      return reply.status(204).send(null)
    },
  )
}

export default friendsRoutes
