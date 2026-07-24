import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  errorSchema,
  markReadBodySchema,
  markReadResponseSchema,
  notificationsResponseSchema,
} from './notifications.schemas.js'
import { listForUser, markRead } from './notifications.service.js'

const notificationsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Token inválido ou ausente. Faça login novamente.',
      })
    }
  })

  /** GET /notifications — lista + contador de não lidas. */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Listar notificações',
        security: [{ bearerAuth: [] }],
        response: { 200: notificationsResponseSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await listForUser(fastify, userId))
    },
  )

  /** POST /notifications/read — marca lidas (todas, ou apenas { ids }). */
  fastify.post(
    '/read',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Marcar notificações como lidas',
        security: [{ bearerAuth: [] }],
        body: markReadBodySchema,
        response: { 200: markReadResponseSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await markRead(fastify, userId, request.body.ids))
    },
  )
}

export default notificationsRoutes
