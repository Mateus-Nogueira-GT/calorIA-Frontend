import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  dietSchema,
  dietWithDaysSchema,
  errorSchema,
  replaceDietItemBodySchema,
  todayPlanSchema,
  todayQuerySchema,
  toggleMealBodySchema,
} from './diets.schemas.js'
import {
  getActiveDiet,
  getDietHistory,
  getDietWithDays,
  getTodayPlan,
  getTodayStatus,
  replaceDietItem,
  toggleMealCompleted,
} from './diets.service.js'
import { getActiveJob, getJob, processJobStep, retryJob } from './jobs.service.js'

const jobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  daysCompleted: z.number().int(),
  totalDays: z.number().int(),
  dietId: z.string().uuid().nullable(),
  error: z.string().nullable(),
})

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
          'Retorna as refeições do dia atual conforme o dia da semana. É o dado principal da tela inicial. ' +
          'O app envia dayNumber/date/tzOffsetMinutes locais; sem eles, usa o dia UTC (legado).',
        security: [{ bearerAuth: [] }],
        querystring: todayQuerySchema,
        response: { 200: todayPlanSchema.nullable(), 400: errorSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getTodayPlan(fastify, userId, request.query))
    },
  )

  /** GET /diets/today/status — por que não há plano hoje (M8) */
  fastify.get(
    '/today/status',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Situação do plano de hoje',
        description:
          'Distingue "sem dieta" de "dieta ativa com o dia de hoje ainda não gerado". ' +
          'O app consulta apenas quando /diets/today responde null, para escolher entre ' +
          'o vazio de onboarding e a oferta de retomar a geração.',
        security: [{ bearerAuth: [] }],
        querystring: todayQuerySchema,
        response: {
          200: z.object({
            hasActiveDiet: z.boolean(),
            dayMissing: z.boolean(),
            resumableJobId: z.string().uuid().nullable(),
          }),
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getTodayStatus(fastify, userId, request.query))
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
        body: toggleMealBodySchema,
        response: {
          200: z.object({ is_completed: z.boolean() }),
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(
        await toggleMealCompleted(
          fastify,
          userId,
          request.params.mealId,
          request.body?.date,
          request.body?.tzOffsetMinutes,
        ),
      )
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

  // ─── Geração assíncrona (job dirigido por polling) ──────────────────────────

  /** GET /diets/jobs/active — job em andamento (retomada no boot do app) */
  fastify.get(
    '/jobs/active',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Geração de dieta em andamento',
        description:
          'Job pending/running mais recente do usuário — o app usa no boot para retomar o polling.',
        security: [{ bearerAuth: [] }],
        response: { 200: jobStatusSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getActiveJob(fastify, userId))
    },
  )

  /** GET /diets/jobs/:id — status do job de geração */
  fastify.get(
    '/jobs/:id',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Status da geração de dieta',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: jobStatusSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getJob(fastify, userId, request.params.id))
    },
  )

  /** POST /diets/jobs/:id/retry — reabre um job que falhou (continua do dia seguinte) */
  fastify.post(
    '/jobs/:id/retry',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Tentar novamente a geração de dieta',
        description:
          'Reabre um job failed mantendo os dias já gerados; o polling de /step continua de onde parou.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: jobStatusSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await retryJob(fastify, userId, request.params.id))
    },
  )

  /** POST /diets/jobs/:id/step — gera o próximo dia (1 dia por chamada) */
  fastify.post(
    '/jobs/:id/step',
    {
      schema: {
        tags: ['Diets'],
        summary: 'Gerar próximo dia da dieta',
        description:
          'Gera e persiste o próximo dia do plano. Chamar em polling até status=completed.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: jobStatusSchema,
          401: errorSchema,
          404: errorSchema,
          422: errorSchema,
          502: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await processJobStep(fastify, userId, request.params.id))
    },
  )
}

export default dietsRoutes
