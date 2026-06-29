import Fastify, { type FastifyError, type FastifyRequest } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import cors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import buildGetJwks from 'get-jwks'
import type { TokenOrHeader } from '@fastify/jwt'

import dbPlugin from './plugins/db.js'
import supabasePlugin from './plugins/supabase.js'
import openaiPlugin from './plugins/openai.js'

import authRoutes from './modules/auth/auth.routes.js'
import usersRoutes from './modules/users/users.routes.js'
import chatRoutes from './modules/chat/chat.routes.js'
import dietsRoutes from './modules/diets/diets.routes.js'
import friendsRoutes from './modules/friends/friends.routes.js'
import feedRoutes from './modules/feed/feed.routes.js'
import challengesRoutes from './modules/challenges/challenges.routes.js'
import foodLogRoutes from './modules/food-log/food-log.routes.js'
import scannerRoutes from './modules/scanner/scanner.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import weightRoutes from './modules/weight/weight.routes.js'

import { env } from './shared/env.js'
import { AppError } from './shared/errors.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
  }).withTypeProvider<ZodTypeProvider>()

  // Zod como provedor de tipos e validação
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // ─── Plugins de infraestrutura ──────────────────────────────────────────────
  // Com origin '*' não se pode enviar credentials:true (viola a spec CORS e o
  // navegador bloqueia). Só habilitamos credentials quando há whitelist explícita.
  const corsWildcard = env.CORS_ORIGIN === '*'
  await app.register(cors, {
    origin: corsWildcard ? true : env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: !corsWildcard,
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'TOO_MANY_REQUESTS',
      message: 'Muitas requisições. Tente novamente em breve.',
    }),
  })

  // O Supabase assina os JWT com chave assimétrica (ES256). A chave pública
  // fica num endpoint JWKS do próprio projeto; buscamos por `kid` e cacheamos.
  const getJwks = buildGetJwks({ max: 10, ttl: 60 * 60 * 1000 })
  await app.register(fastifyJwt, {
    decode: { complete: true },
    secret: async (_request: FastifyRequest, tokenOrHeader: TokenOrHeader): Promise<string> => {
      const { header, payload } = tokenOrHeader as {
        header: { kid: string; alg: string }
        payload: { iss: string }
      }
      // Só buscamos JWKS se o issuer for do próprio projeto Supabase — evita
      // fetch de chave a partir de um domínio forjado num token malicioso.
      if (!payload.iss || !payload.iss.startsWith(env.SUPABASE_URL)) {
        throw new Error('Issuer do token não corresponde ao Supabase configurado')
      }
      return getJwks.getPublicKey({ kid: header.kid, domain: payload.iss, alg: header.alg })
    },
    verify: { algorithms: ['ES256'] },
  })

  // ─── Plugins da aplicação ───────────────────────────────────────────────────
  await app.register(dbPlugin)
  await app.register(supabasePlugin)
  await app.register(openaiPlugin)

  // ─── Documentação da API (apenas fora de produção) ──────────────────────────
  if (env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.0',
        info: {
          title: 'CalorIA API',
          description: 'API do aplicativo de dietas com IA — CalorIA',
          version: '1.0.0',
        },
        tags: [
          { name: 'Auth', description: 'Autenticação e sessões' },
          { name: 'Users', description: 'Perfil do usuário' },
          { name: 'Chat', description: 'Chat com IA para geração de dietas' },
          { name: 'Diets', description: 'Plano alimentar + progresso diário' },
          { name: 'Friends', description: 'Amizades entre usuários' },
          { name: 'Feed', description: 'Feed social' },
          { name: 'Challenges', description: 'Desafios entre amigos' },
          { name: 'FoodLog', description: 'Diário alimentar livre (fora do plano)' },
          { name: 'Scanner', description: 'Análise de foto de refeição via IA Vision' },
          { name: 'Notifications', description: 'Notificações in-app' },
          { name: 'Weight', description: 'Histórico de peso / evolução' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Token JWT retornado pelo endpoint /auth/login',
            },
          },
        },
      },
    })
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
      staticCSP: true,
    })
  }

  // ─── Handler global de erros ────────────────────────────────────────────────
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Erros de negócio conhecidos
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      })
    }

    // Erros de validação (Zod)
    if (error.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Dados inválidos na requisição',
        details: error.validation,
      })
    }

    // Rate limit
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições. Tente novamente em breve.',
      })
    }

    app.log.error({ err: error, url: request.url }, 'Erro não tratado')
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro inesperado',
    })
  })

  // ─── Health check ───────────────────────────────────────────────────────────
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    version: '1.0.0',
  }))

  // ─── Rotas ──────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.register(chatRoutes, { prefix: '/chat' })
  await app.register(dietsRoutes, { prefix: '/diets' })
  await app.register(friendsRoutes, { prefix: '/friends' })
  // Sem prefixo: o front usa GET /feed (lista) e /posts/* (criar/curtir/comentar).
  await app.register(feedRoutes)
  await app.register(challengesRoutes, { prefix: '/challenges' })
  await app.register(foodLogRoutes, { prefix: '/food-log' })
  await app.register(scannerRoutes, { prefix: '/scanner' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(weightRoutes, { prefix: '/weight' })

  return app
}
