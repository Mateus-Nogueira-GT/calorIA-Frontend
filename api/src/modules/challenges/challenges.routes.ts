import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  challengeSchema,
  challengeDetailSchema,
  challengeMemberSchema,
  createChallengeBodySchema,
  joinChallengeBodySchema,
  errorSchema,
} from './challenges.schemas.js'
import {
  createChallenge,
  listMyChallenges,
  getChallengeDetail,
  joinChallengeByCode,
  leaveChallenge,
  checkIn,
} from './challenges.service.js'

const challengesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Token inválido ou ausente.' })
    }
  })

  /** GET /challenges — meus desafios */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Meus desafios',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(challengeSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await listMyChallenges(fastify, userId))
    },
  )

  /** POST /challenges — criar desafio */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Criar desafio',
        security: [{ bearerAuth: [] }],
        body: createChallengeBodySchema,
        response: { 201: challengeSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const created = await createChallenge(fastify, userId, request.body)
      return reply.status(201).send(created)
    },
  )

  /** GET /challenges/:id — detalhe + ranking */
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Detalhe do desafio com ranking',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: challengeDetailSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getChallengeDetail(fastify, userId, request.params.id))
    },
  )

  /** POST /challenges/join — entrar via código de convite */
  fastify.post(
    '/join',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Entrar em desafio via código de convite',
        security: [{ bearerAuth: [] }],
        body: joinChallengeBodySchema,
        response: {
          200: z.object({ id: z.string().uuid() }),
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await joinChallengeByCode(fastify, userId, request.body.invite_code))
    },
  )

  /** POST /challenges/:id/checkin — check-in diário */
  fastify.post(
    '/:id/checkin',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Check-in diário no desafio',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: challengeMemberSchema,
          401: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await checkIn(fastify, userId, request.params.id))
    },
  )

  /** DELETE /challenges/:id/leave — saída do desafio */
  fastify.delete(
    '/:id/leave',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Saída do desafio',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      await leaveChallenge(fastify, userId, request.params.id)
      return reply.status(204).send(null)
    },
  )
}

export default challengesRoutes
