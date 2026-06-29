import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  challengeSchema,
  leaderboardEntrySchema,
  challengeMemberSchema,
  createChallengeBodySchema,
  errorSchema,
} from './challenges.schemas.js'
import {
  createChallenge,
  listMyChallenges,
  joinChallenge,
  resolveInvite,
  getLeaderboard,
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
        response: { 201: challengeSchema, 401: errorSchema, 422: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const challenge = await createChallenge(fastify, userId, request.body)
      return reply.status(201).send(challenge)
    },
  )

  /** GET /challenges/invite/:code — preview do desafio por código (antes de entrar) */
  fastify.get(
    '/invite/:code',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Preview de convite',
        security: [{ bearerAuth: [] }],
        params: z.object({ code: z.string().min(4).max(20) }),
        response: { 200: challengeSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await resolveInvite(fastify, userId, request.params.code))
    },
  )

  /** POST /challenges/:id/join — entrar no desafio */
  fastify.post(
    '/:id/join',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Entrar no desafio',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: challengeSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await joinChallenge(fastify, userId, request.params.id))
    },
  )

  /** GET /challenges/:id/leaderboard — ranking do desafio */
  fastify.get(
    '/:id/leaderboard',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Ranking do desafio',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(leaderboardEntrySchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getLeaderboard(fastify, userId, request.params.id))
    },
  )

  /** POST /challenges/:id/checkin — check-in diário */
  fastify.post(
    '/:id/checkin',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Check-in diário',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: challengeMemberSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await checkIn(fastify, userId, request.params.id))
    },
  )

  /** DELETE /challenges/:id/leave — sair do desafio */
  fastify.delete(
    '/:id/leave',
    {
      schema: {
        tags: ['Challenges'],
        summary: 'Sair do desafio',
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
