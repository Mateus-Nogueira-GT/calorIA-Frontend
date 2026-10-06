import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  TRANSCRIBE_BODY_LIMIT,
  chatMessageBodySchema,
  chatMessageSchema,
  chatResponseSchema,
  errorSchema,
  transcribeBodySchema,
  transcribeResponseSchema,
} from './chat.schemas.js'
import { getChatHistory, sendChatMessage } from './chat.service.js'
import { transcribeAudio } from './transcribe.service.js'

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
          422: errorSchema.describe('AI_CONTENT_FILTERED — o modelo recusou a mensagem'),
          429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'),
          500: errorSchema.describe('HISTORY_WRITE_FAILED — a conversa não foi salva; reenviar'),
          502: errorSchema.describe(
            'AI_ERROR | AI_UNAVAILABLE | AI_TRUNCATED — nada foi persistido',
          ),
          504: errorSchema.describe('AI_TIMEOUT'),
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
   * POST /chat/transcribe
   * Transcreve um áudio curto (≤60 s) do usuário para texto. O app envia o texto
   * em seguida como mensagem normal via POST /chat/message.
   */
  fastify.post(
    '/transcribe',
    {
      // base64 de 60 s de m4a ≈ 350 KB, mas o padrão de 1 MB do Fastify é
      // apertado para gravações em bitrate maior. Abaixo dos 4,5 MB da Vercel.
      bodyLimit: TRANSCRIBE_BODY_LIMIT,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Chat'],
        summary: 'Transcrever áudio',
        description:
          'Recebe áudio em base64 puro (sem prefixo data:) e devolve o texto transcrito (Whisper via OpenRouter, pt).',
        security: [{ bearerAuth: [] }],
        body: transcribeBodySchema,
        response: {
          200: transcribeResponseSchema,
          401: errorSchema,
          422: errorSchema.describe('EMPTY_TRANSCRIPTION — nada foi entendido no áudio'),
          429: errorSchema.describe('TOO_MANY_REQUESTS | AI_QUOTA_EXCEEDED'),
          502: errorSchema.describe('TRANSCRIBE_FAILED — falha/timeout; pode tentar de novo'),
          503: errorSchema.describe('TRANSCRIBE_UNAVAILABLE — provedor recusou; digitar'),
        },
      },
    },
    async (request, reply) => {
      const { sub: userId } = request.user as JwtPayload
      return reply.send(await transcribeAudio(fastify, userId, request.body))
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
