import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  dietSchema,
  dietWithDaysSchema,
  dietDaySchema,
  replaceDietItemBodySchema,
  errorSchema,
} from './diets.schemas.js'
import {
  getActiveDiet,
  getDietWithDays,
  getTodayDiet,
  toggleMealCompleted,
  replaceDietItem,
  getDietHistory,
} from './diets.service.js'

const dietsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Autenticação obrigatória em todas as rotas
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Token inválido ou ausente.' })
    }
  })

  // ─── Dietas ────────────────────────────────────────────────────────────────

  /** GET /diets/current — dieta ativa (só cabeçalho) */
  fastify.get(
    '/current',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Dieta ativa',
        description:
          'Retorna o cabeçalho da dieta ativa (metas de calorias/macros). Para obter os dias completos use /diets/current/full.',
        security: [{ bearerAuth: [] }],
        response: { 200: dietSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getActiveDiet(fastify, userId))
    },
  )

  /** GET /diets/current/full — dieta ativa com todos os 7 dias */
  fastify.get(
    '/current/full',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Dieta ativa completa',
        description: 'Retorna a dieta ativa com todos os 7 dias, refeições e itens.',
        security: [{ bearerAuth: [] }],
        response: { 200: dietWithDaysSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const diet = await getActiveDiet(fastify, userId)
      return reply.send(await getDietWithDays(fastify, userId, diet.id))
    },
  )

  /** GET /diets/today — dia atual da dieta (tela principal) */
  fastify.get(
    '/today',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Dieta de hoje',
        description:
          'Retorna as refeições do dia atual conforme o dia da semana. É o dado principal da tela inicial.',
        security: [{ bearerAuth: [] }],
        response: { 200: dietDaySchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getTodayDiet(fastify, userId))
    },
  )

  /** GET /diets/history — histórico de dietas */
  fastify.get(
    '/history',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Histórico de dietas',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(dietSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getDietHistory(fastify, userId))
    },
  )

  /** GET /diets/:id — dieta específica completa */
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Dieta por ID',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: dietWithDaysSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getDietWithDays(fastify, userId, request.params.id))
    },
  )

  // ─── Ações nas refeições ──────────────────────────────────────────────────

  /** PATCH /diets/meals/:mealId/toggle — marcar/desmarcar refeição */
  fastify.patch(
    '/meals/:mealId/toggle',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Marcar refeição como concluída',
        description:
          'Alterna o estado concluído/pendente de uma refeição. Também atualiza o streak do usuário.',
        security: [{ bearerAuth: [] }],
        params: z.object({ mealId: z.string().uuid() }),
        response: {
          200: z.object({ is_completed: z.boolean() }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await toggleMealCompleted(fastify, userId, request.params.mealId))
    },
  )

  /** POST /diets/items/:itemId/replace — substituir um item da dieta */
  fastify.post(
    '/items/:itemId/replace',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Substituir item da dieta',
        description:
          'Substitui um alimento da dieta por outro. O item original é arquivado e o novo é criado.',
        security: [{ bearerAuth: [] }],
        params: z.object({ itemId: z.string().uuid() }),
        body: replaceDietItemBodySchema,
        response: {
          200: z.object({ new_item_id: z.string().uuid() }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await replaceDietItem(fastify, userId, request.params.itemId, request.body))
    },
  )
}

export default dietsRoutes
