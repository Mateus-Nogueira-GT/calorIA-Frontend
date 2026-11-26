import cors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import type { TokenOrHeader } from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyError, type FastifyRequest } from 'fastify'
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import buildGetJwks from 'get-jwks'

import dbPlugin from './plugins/db.js'
import openaiPlugin from './plugins/openai.js'
import supabasePlugin from './plugins/supabase.js'

import adminRoutes from './modules/admin/admin.routes.js'
import authRoutes from './modules/auth/auth.routes.js'
import challengesRoutes from './modules/challenges/challenges.routes.js'
import chatRoutes from './modules/chat/chat.routes.js'
import creditInvitesRoutes from './modules/credit-invites/credit-invites.routes.js'
import creditsRoutes from './modules/credits/credits.routes.js'
import dietsRoutes from './modules/diets/diets.routes.js'
import feedRoutes from './modules/feed/feed.routes.js'
import foodLogRoutes from './modules/food-log/food-log.routes.js'
import friendsRoutes from './modules/friends/friends.routes.js'
import notificationsRoutes from './modules/notifications/notifications.routes.js'
import scannerRoutes from './modules/scanner/scanner.routes.js'
import asaasWebhookRoutes from './modules/subscriptions/asaas-webhook.routes.js'
import creditPurchasesRoutes from './modules/subscriptions/credit-purchases.routes.js'
import subscriptionsRoutes from './modules/subscriptions/subscriptions.routes.js'
import usersRoutes from './modules/users/users.routes.js'
import weightRoutes from './modules/weight/weight.routes.js'

import { isAllowedIssuer, supabaseIssuer } from './shared/auth-issuer.js'
import { env } from './shared/env.js'
import { AppError } from './shared/errors.js'

/** `sub` de tokens que passaram no jwtVerify, por requisição (chave do rate limit). */
const verifiedSubs = new WeakMap<FastifyRequest, string>()

const invalidToken = () =>
  new AppError(401, 'UNAUTHORIZED', 'Token inválido ou ausente. Faça login novamente.')

export async function buildApp() {
  const app = Fastify({
    // Atrás do proxy da Vercel, request.ip sem trustProxy é o IP interno do
    // balanceador — o MESMO para todos os usuários. Com Fluid Compute (várias
    // requisições concorrentes na mesma instância), o rate limit virava um
    // bucket global compartilhado: 10 logins/min PARA TODOS (falsos 429) e
    // proteção anti-brute-force por IP inócua. trustProxy lê o x-forwarded-for.
    trustProxy: true,
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Usuário autenticado é limitado por conta; anônimo, token inválido e
    // /auth/* pelo IP real. O `sub` vem do hook onRequest abaixo, que só grava
    // o de token VERIFICADO (A7: antes lia request.user, que no onRequest
    // ainda não existe, e tudo caía no IP).
    keyGenerator: (request) => verifiedSubs.get(request) ?? request.ip,
    // O plugin LANÇA o que este builder devolve: sem statusCode, o handler
    // global tratava o excesso como erro desconhecido e respondia 500 (A2).
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: 'TOO_MANY_REQUESTS',
      message: 'Muitas requisições. Tente novamente em breve.',
    }),
  })

  // O Supabase assina os JWT com chave assimétrica (ES256). A chave pública
  // fica num endpoint JWKS do próprio projeto; buscamos por `kid` e cacheamos.
  // A1 do pente fino: a JWKS vem SEMPRE do issuer fixo do Supabase Auth, nunca
  // do `iss` do token (que o atacante controla), e o verify confere iss e aud.
  const issuer = supabaseIssuer(env.SUPABASE_URL)
  const getJwks = buildGetJwks({ max: 10, ttl: 60 * 60 * 1000, issuersWhitelist: [issuer] })
  await app.register(fastifyJwt, {
    decode: { complete: true },
    secret: async (_request: FastifyRequest, tokenOrHeader: TokenOrHeader): Promise<string> => {
      const { header, payload } = tokenOrHeader as {
        header: { kid: string; alg: string }
        payload: { iss: string }
      }
      // Token recusado é 401 (AppError): um Error solto daqui não passa pelo
      // wrapper do @fastify/jwt e virava 500/503 nas rotas sem try/catch.
      if (!isAllowedIssuer(payload.iss, env.SUPABASE_URL)) throw invalidToken()
      try {
        return await getJwks.getPublicKey({ kid: header.kid, domain: issuer, alg: header.alg })
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code === 'JWK_NOT_FOUND' || code === 'DOMAIN_NOT_ALLOWED') throw invalidToken()
        throw err
      }
    },
    verify: {
      algorithms: ['ES256'],
      allowedIss: issuer,
      allowedAud: 'authenticated',
      requiredClaims: ['iss', 'aud'],
    },
  })

  // A7: verifica o bearer em silêncio ANTES do rate limit (hooks da instância
  // rodam antes dos hooks de rota que o @fastify/rate-limit instala). Falha de
  // verificação não responde nada: a rota decide, e o limite fica no IP.
  // /auth/* fica sempre no IP (login, cadastro, refresh, reenvio de e-mail).
  // Fica aberto: o store do limite é em memória, por instância.
  app.addHook('onRequest', async (request) => {
    if (request.routeOptions.url?.startsWith('/auth/')) return
    if (!/^Bearer\s+\S/i.test(request.headers.authorization ?? '')) return
    try {
      const payload = await request.jwtVerify<{ sub?: unknown }>()
      if (typeof payload.sub === 'string' && payload.sub) verifiedSubs.set(request, payload.sub)
    } catch {
      // Token inválido, JWKS fora do ar etc.: segue por IP.
    } finally {
      // Não antecipa a autenticação: as rotas continuam chamando jwtVerify.
      request.user = null as never
    }
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
        ...(error.details ? { details: error.details } : {}),
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

    // Erros 4xx do próprio Fastify (ex: FST_ERR_CTP_EMPTY_JSON_BODY = POST com
    // Content-Type json e body vazio). Mascarar como 500 esconde a causa real.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.code ?? 'BAD_REQUEST',
        message: error.message,
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
  await app.register(creditsRoutes, { prefix: '/credits' })
  await app.register(creditInvitesRoutes, { prefix: '/credit-invites' })
  await app.register(adminRoutes, { prefix: '/admin' })
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
  // Assinatura (Asaas): 404 com SUBSCRIPTIONS_ENABLED=false. O webhook não usa JWT.
  await app.register(subscriptionsRoutes, { prefix: '/subscriptions' })
  await app.register(asaasWebhookRoutes, { prefix: '/webhooks/asaas' })
  // Recarga de créditos: 404 com CREDIT_PURCHASES_ENABLED=false.
  await app.register(creditPurchasesRoutes, { prefix: '/credit-purchases' })

  return app
}
