import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  registerBodySchema,
  loginBodySchema,
  refreshBodySchema,
  authResponseSchema,
  errorSchema,
} from './auth.schemas.js'
import { registerUser, loginUser, refreshSession } from './auth.service.js'

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  /**
   * POST /auth/register
   * Cria uma nova conta de usuário.
   */
  fastify.post('/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Criar conta',
      description: 'Registra um novo usuário e retorna tokens de autenticação.',
      body: registerBodySchema,
      response: {
        201: authResponseSchema,
        409: errorSchema.describe('Email já cadastrado'),
        422: errorSchema.describe('Dados inválidos'),
      },
    },
  }, async (request, reply) => {
    const result = await registerUser(fastify, request.body)
    return reply.status(201).send(result)
  })

  /**
   * POST /auth/login
   * Autentica com email e senha.
   */
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login',
      description: 'Autentica com email e senha. Retorna access_token e refresh_token.',
      body: loginBodySchema,
      response: {
        200: authResponseSchema,
        401: errorSchema.describe('Credenciais inválidas'),
      },
    },
  }, async (request, reply) => {
    const result = await loginUser(fastify, request.body)
    return reply.send(result)
  })

  /**
   * POST /auth/refresh
   * Renova o access_token usando o refresh_token.
   */
  fastify.post('/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Renovar token',
      description: 'Gera um novo access_token a partir de um refresh_token válido.',
      body: refreshBodySchema,
      response: {
        200: authResponseSchema,
        401: errorSchema.describe('Refresh token inválido ou expirado'),
      },
    },
  }, async (request, reply) => {
    const result = await refreshSession(fastify, request.body)
    return reply.send(result)
  })
}

export default authRoutes
