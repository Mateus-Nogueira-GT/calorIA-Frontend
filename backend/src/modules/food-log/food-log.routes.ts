import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  addMealBodySchema,
  daySummarySchema,
  errorSchema,
  listMealsQuerySchema,
  mealParamsSchema,
  mealSchema,
  summaryQuerySchema,
} from './food-log.schemas.js'
import { addMeal, deleteMeal, getSummary, listMeals } from './food-log.service.js'

const foodLogRoutes: FastifyPluginAsyncZod = async (fastify) => {
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
   * GET /food-log?date=YYYY-MM-DD
   * Lista as refeições do diário livre registradas num dia.
   */
  fastify.get(
    '/',
    {
      schema: {
        tags: ['FoodLog'],
        summary: 'Listar refeições do diário livre',
        security: [{ bearerAuth: [] }],
        querystring: listMealsQuerySchema,
        response: { 200: z.array(mealSchema), 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await listMeals(fastify, userId, request.query.date))
    },
  )

  /**
   * GET /food-log/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Totais agregados por dia (G4) — 1 request para o gráfico semanal.
   */
  fastify.get(
    '/summary',
    {
      schema: {
        tags: ['FoodLog'],
        summary: 'Resumo diário agregado por período',
        security: [{ bearerAuth: [] }],
        querystring: summaryQuerySchema,
        response: { 200: z.array(daySummarySchema), 400: errorSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const { from, to } = request.query
      return reply.send(await getSummary(fastify, userId, from, to))
    },
  )

  /**
   * POST /food-log
   * Registra uma refeição livre (fora do plano alimentar).
   */
  fastify.post(
    '/',
    {
      schema: {
        tags: ['FoodLog'],
        summary: 'Registrar refeição no diário livre',
        security: [{ bearerAuth: [] }],
        body: addMealBodySchema,
        response: { 201: mealSchema, 401: errorSchema, 422: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const meal = await addMeal(fastify, userId, request.body)
      return reply.status(201).send(meal)
    },
  )

  /**
   * DELETE /food-log/:id
   * Remove uma refeição do diário livre.
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['FoodLog'],
        summary: 'Remover refeição do diário livre',
        security: [{ bearerAuth: [] }],
        params: mealParamsSchema,
        response: { 204: z.null(), 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      await deleteMeal(fastify, userId, request.params.id)
      return reply.status(204).send(null)
    },
  )
}

export default foodLogRoutes
