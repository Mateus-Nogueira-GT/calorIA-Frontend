import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { JwtPayload } from '../../shared/types.js'
import { analyzePhotoBodySchema, errorSchema, scanResponseSchema } from './scanner.schemas.js'
import { analyzePhoto } from './scanner.service.js'

const scannerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Autenticação obrigatória
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
   * POST /scanner/analyze
   * Recebe a foto de um prato (data URL base64) e retorna a estimativa nutricional.
   */
  fastify.post(
    '/analyze',
    {
      // Imagens base64 estouram o limite padrão de 1MB do Fastify.
      bodyLimit: 8 * 1024 * 1024,
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Scanner'],
        summary: 'Analisar foto de refeição',
        description:
          'Envia uma imagem (data URL base64) para análise via IA Vision e retorna a estimativa de calorias e macros.',
        security: [{ bearerAuth: [] }],
        body: analyzePhotoBodySchema,
        response: {
          200: scanResponseSchema,
          401: errorSchema,
          422: errorSchema.describe('Imagem não contém comida'),
          429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'),
          502: errorSchema.describe('Serviço de IA indisponível'),
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await analyzePhoto(fastify, request.body.image, userId))
    },
  )
}

export default scannerRoutes
