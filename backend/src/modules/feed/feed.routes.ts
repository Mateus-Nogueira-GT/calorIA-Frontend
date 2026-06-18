import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  feedPostSchema,
  commentSchema,
  createPostBodySchema,
  createCommentBodySchema,
  feedQuerySchema,
  errorSchema,
} from './feed.schemas.js'
import {
  createPost,
  getFeed,
  deletePost,
  toggleLike,
  addComment,
  getComments,
} from './feed.service.js'

const feedRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Token inválido ou ausente.' })
    }
  })

  /** GET /feed — feed social (próprios posts + amigos) */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Feed social',
        security: [{ bearerAuth: [] }],
        querystring: feedQuerySchema,
        response: { 200: z.array(feedPostSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const { limit, before } = request.query
      return reply.send(await getFeed(fastify, userId, limit, before))
    },
  )

  /** POST /feed/posts — criar post */
  fastify.post(
    '/posts',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Criar post',
        security: [{ bearerAuth: [] }],
        body: createPostBodySchema,
        response: { 201: z.object({ id: z.string().uuid() }), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const created = await createPost(fastify, userId, request.body.content)
      return reply.status(201).send(created)
    },
  )

  /** DELETE /feed/posts/:id — remover post próprio */
  fastify.delete(
    '/posts/:id',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Remover post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      await deletePost(fastify, userId, request.params.id)
      return reply.status(204).send(null)
    },
  )

  /** POST /feed/posts/:id/like — curtir/descurtir post */
  fastify.post(
    '/posts/:id/like',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Curtir/descurtir post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ liked: z.boolean() }), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await toggleLike(fastify, userId, request.params.id))
    },
  )

  /** GET /feed/posts/:id/comments — listar comentários */
  fastify.get(
    '/posts/:id/comments',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Listar comentários do post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.array(commentSchema), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getComments(fastify, userId, request.params.id))
    },
  )

  /** POST /feed/posts/:id/comments — comentar post */
  fastify.post(
    '/posts/:id/comments',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Comentar post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: createCommentBodySchema,
        response: { 201: z.object({ id: z.string().uuid() }), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const created = await addComment(fastify, userId, request.params.id, request.body.content)
      return reply.status(201).send(created)
    },
  )
}

export default feedRoutes
