import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  chatMessageBodySchema,
  chatResponseSchema,
  chatMessageSchema,
  errorSchema,
} from './chat.schemas.js'
import { sendChatMessage, getChatHistory } from './chat.service.js'

const chatRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Todas as rotas de chat exigem autenticação
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
   * POST /chat/message
   *
   * Envia uma mensagem para o assistente de dietas.
   * O assistente coleta dados do usuário progressivamente e ao final gera a dieta.
   *
   * Fluxo:
   *  1. Primeira mensagem → conversation_id: null (nova conversa)
   *  2. Mensagens seguintes → conversation_id do retorno anterior
   *  3. Quando diet_generated: true → redirecionar para a tela da dieta
   */
  fastify.post(
    '/message',
    {
      config: {
        rateLimit: {
          max: 30, // máximo de 30 mensagens
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Chat'],
        summary: 'Enviar mensagem',
        description: `
Envia uma mensagem para o assistente de dietas com IA.

**Fluxo de uso:**
1. Primeira mensagem: envie \`conversation_id: null\`
2. O assistente coleta dados gradualmente (peso, objetivo, restrições, etc.)
3. Quando coletar tudo, \`diet_generated\` retornará \`true\` e \`diet_id\` terá o ID da dieta
4. Redirecione para a tela principal com a dieta gerada
      `.trim(),
        security: [{ bearerAuth: [] }],
        body: chatMessageBodySchema,
        response: {
          200: chatResponseSchema,
          401: errorSchema,
          429: errorSchema.describe('Limite de mensagens atingido'),
          502: errorSchema.describe('Serviço de IA indisponível'),
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      const result = await sendChatMessage(fastify, userId, request.body)
      return reply.send(result)
    },
  )

  /**
   * GET /chat/history/:conversationId
   * Retorna o histórico completo de uma conversa.
   */
  fastify.get(
    '/history/:conversationId',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Histórico de conversa',
        security: [{ bearerAuth: [] }],
        params: z.object({ conversationId: z.string().uuid() }),
        response: {
          200: z.object({
            messages: z.array(
              z.object({ role: z.enum(['user', 'assistant']), content: z.string() }),
            ),
            status: z.string(),
          }),
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await getChatHistory(fastify, userId, request.params.conversationId))
    },
  )
}

export default chatRoutes
