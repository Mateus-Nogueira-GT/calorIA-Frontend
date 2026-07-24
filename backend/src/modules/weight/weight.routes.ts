import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import { addWeightBodySchema, errorSchema, weightEntrySchema } from './weight.schemas.js'
import { getHistory, upsertEntry } from './weight.service.js'

const weightRoutes: FastifyPluginAsyncZod = async (fastify) => {
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

  /** GET /weight — histórico de peso (ordenado por data). */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Weight'],
        summary: 'Histórico de peso',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(weightEntrySchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getHistory(fastify, userId))
    },
  )

  /** POST /weight — registra (ou atualiza) o peso de um dia. */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Weight'],
        summary: 'Registrar peso',
        security: [{ bearerAuth: [] }],
        body: addWeightBodySchema,
        response: { 200: weightEntrySchema, 401: errorSchema, 422: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await upsertEntry(fastify, userId, request.body))
    },
  )
}

export default weightRoutes
