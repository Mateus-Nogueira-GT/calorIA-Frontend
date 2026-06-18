import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { JwtPayload } from '../../shared/types.js'
import { profileSchema, updateProfileBodySchema, errorSchema } from './users.schemas.js'
import { getUserProfile, updateUserProfile } from './users.service.js'

const usersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Todas as rotas deste módulo exigem autenticação via JWT
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

  /**
   * GET /users/me
   * Retorna o perfil completo do usuário autenticado.
   */
  fastify.get(
    '/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Meu perfil',
        description: 'Retorna todos os dados do perfil do usuário autenticado.',
        security: [{ bearerAuth: [] }],
        response: {
          200: profileSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const profile = await getUserProfile(fastify, userId)
      return reply.send(profile)
    },
  )

  /**
   * PUT /users/me/profile
   * Atualiza dados do perfil (peso, altura, objetivo, restrições, etc.)
   */
  fastify.put(
    '/me/profile',
    {
      schema: {
        tags: ['Users'],
        summary: 'Atualizar perfil',
        description: 'Atualiza parcialmente o perfil. Envie apenas os campos que deseja alterar.',
        security: [{ bearerAuth: [] }],
        body: updateProfileBodySchema,
        response: {
          200: profileSchema,
          401: errorSchema,
          404: errorSchema,
          422: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const profile = await updateUserProfile(fastify, userId, request.body)
      return reply.send(profile)
    },
  )
}

export default usersRoutes
