import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod'
import type { JwtPayload } from '../../shared/types.js'
import { analyzePhotoBodySchema, errorSchema, scanResponseSchema } from './scanner.schemas.js'
import { analyzePhoto } from './scanner.service.js'

// Imagens base64 estouram o limite padrão de 1MB do Fastify.
const BODY_LIMIT = 8 * 1024 * 1024

/** Convidado: por IP, por hora. Também há o teto global diário (checkDailyQuota). */
export const GUEST_SCANS_PER_HOUR = 10

const scannerRoutes: FastifyPluginAsyncZod = async (fastify) => {
  /**
   * POST /scanner/analyze-guest
   * Mesma análise SEM conta. Guideline 5.1.1(v) da App Store: o scanner não é
   * recurso de conta, então não pode exigir cadastro. Só SALVAR no diário exige.
   * Nada é gravado com vínculo a usuário (ai_usage fica com user_id NULL).
   */
  fastify.post(
    '/analyze-guest',
    {
      bodyLimit: BODY_LIMIT,
      config: {
        rateLimit: {
          max: GUEST_SCANS_PER_HOUR,
          timeWindow: '1 hour',
          keyGenerator: (request) => request.ip,
          // statusCode explícito: o objeto é lançado e cai no error handler do server.ts.
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'TOO_MANY_REQUESTS',
            message: 'Você atingiu o limite de análises sem conta. Crie uma conta para continuar.',
          }),
        },
      },
      schema: {
        tags: ['Scanner'],
        summary: 'Analisar foto de refeição (sem conta)',
        description:
          'Igual a /scanner/analyze, sem autenticação. Limitado por IP e por um teto diário global de convidados.',
        body: analyzePhotoBodySchema,
        response: {
          200: scanResponseSchema,
          422: errorSchema.describe('Imagem não contém comida'),
          429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'),
          503: errorSchema.describe('CREDIT_POLICY_UNAVAILABLE | CREDITS_UNAVAILABLE'),
          502: errorSchema.describe('Serviço de IA indisponível'),
        },
      },
    },
    async (request, reply) => reply.send(await analyzePhoto(fastify, request.body.image, null)),
  )

  // Escopo encapsulado: o hook de JWT vale só para as rotas de conta abaixo.
  await fastify.register(async (instance) => {
    const authed = instance.withTypeProvider<ZodTypeProvider>()
    authed.addHook('preHandler', async (request, reply) => {
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
    authed.post(
      '/analyze',
      {
        bodyLimit: BODY_LIMIT,
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
            400: errorSchema.describe('IDEMPOTENCY_KEY_REQUIRED — atualize o aplicativo'),
            401: errorSchema,
            402: errorSchema.describe('INSUFFICIENT_CREDITS'),
            409: errorSchema.describe(
              'IDEMPOTENCY_CONFLICT | OPERATION_PENDING | OPERATION_FAILED',
            ),
            503: errorSchema.describe('CREDITS_UNAVAILABLE | CREDIT_POLICY_UNAVAILABLE'),
            422: errorSchema.describe('Imagem não contém comida'),
            429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'),
            502: errorSchema.describe('Serviço de IA indisponível'),
          },
        },
      },
      async (request, reply) => {
        const { sub: userId } = request.user as JwtPayload
        return reply.send(
          await analyzePhoto(
            fastify,
            request.body.image,
            userId,
            typeof request.headers['idempotency-key'] === 'string'
              ? request.headers['idempotency-key']
              : undefined,
          ),
        )
      },
    )
  })
}

export default scannerRoutes
