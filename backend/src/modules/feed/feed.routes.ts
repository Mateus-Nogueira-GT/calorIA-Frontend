import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  commentSchema,
  createCommentBodySchema,
  createPostBodySchema,
  errorSchema,
  feedPageSchema,
  feedQuerySchema,
  likeResultSchema,
  postSchema,
} from './feed.schemas.js'
import {
  addComment,
  createUserPost,
  deletePost,
  getComments,
  getFeed,
  likePost,
  unlikePost,
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

  /** GET /feed — feed social paginado (keyset por createdAt). */
  fastify.get(
    '/feed',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Feed social',
        security: [{ bearerAuth: [] }],
        querystring: feedQuerySchema,
        response: { 200: feedPageSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const { limit, cursor } = request.query
      return reply.send(await getFeed(fastify, userId, limit, cursor))
    },
  )

  /** POST /posts — criar post (retorna o post completo). */
  fastify.post(
    '/posts',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Criar post',
        security: [{ bearerAuth: [] }],
        body: createPostBodySchema,
        response: { 201: postSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const post = await createUserPost(
        fastify,
        userId,
        request.body.content,
        request.body.achievement,
      )
      return reply.status(201).send(post)
    },
  )

  /** DELETE /posts/:id — remover post próprio. */
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

  /** POST /posts/:id/like — curtir (idempotente). */
  fastify.post(
    '/posts/:id/like',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Curtir post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: likeResultSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await likePost(fastify, userId, request.params.id))
    },
  )

  /** DELETE /posts/:id/like — descurtir (idempotente). */
  fastify.delete(
    '/posts/:id/like',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Descurtir post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: likeResultSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await unlikePost(fastify, userId, request.params.id))
    },
  )

  /** GET /posts/:id/comments — listar comentários. */
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

  /** POST /posts/:id/comments — comentar (retorna o comentário completo). */
  fastify.post(
    '/posts/:id/comments',
    {
      schema: {
        tags: ['Feed'],
        summary: 'Comentar post',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: createCommentBodySchema,
        response: { 201: commentSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const comment = await addComment(fastify, userId, request.params.id, request.body.content)
      return reply.status(201).send(comment)
    },
  )
}

export default feedRoutes
