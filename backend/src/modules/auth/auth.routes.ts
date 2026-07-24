import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  appleBodySchema,
  authResponseSchema,
  errorSchema,
  forgotPasswordBodySchema,
  googleBodySchema,
  loginBodySchema,
  logoutResponseSchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  successResponseSchema,
} from './auth.schemas.js'
import {
  appleLogin,
  forgotPassword,
  googleLogin,
  loginUser,
  logout,
  refreshSession,
  registerUser,
  resetPassword,
} from './auth.service.js'

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  /**
   * POST /auth/register
   * Cria uma nova conta de usuário.
   */
  fastify.post(
    '/register',
    {
      // Limite mais estrito que o global pra mitigar abuso/brute-force.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
    },
    async (request, reply) => {
      const result = await registerUser(fastify, request.body)
      return reply.status(201).send(result)
    },
  )

  /**
   * POST /auth/login
   * Autentica com email e senha.
   */
  fastify.post(
    '/login',
    {
      // Limite mais estrito que o global pra mitigar brute-force de credenciais.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
    },
    async (request, reply) => {
      const result = await loginUser(fastify, request.body)
      return reply.send(result)
    },
  )

  /**
   * POST /auth/refresh
   * Renova o access_token usando o refresh_token.
   */
  fastify.post(
    '/refresh',
    {
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
    },
    async (request, reply) => {
      const result = await refreshSession(fastify, request.body)
      return reply.send(result)
    },
  )

  /**
   * POST /auth/google
   * Login social com Google (valida o id_token no Supabase).
   */
  fastify.post(
    '/google',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Login com Google',
        body: googleBodySchema,
        response: { 200: authResponseSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      return reply.send(await googleLogin(fastify, request.body.idToken))
    },
  )

  /**
   * POST /auth/apple
   * Login social com Apple (valida o identity_token no Supabase).
   */
  fastify.post(
    '/apple',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Login com Apple',
        body: appleBodySchema,
        response: { 200: authResponseSchema, 401: errorSchema },
      },
    },
    async (request, reply) => {
      const { identityToken, fullName } = request.body
      return reply.send(await appleLogin(fastify, identityToken, fullName))
    },
  )

  /**
   * POST /auth/forgot-password
   * Envia o email de recuperação. Resposta idêntica com ou sem conta.
   */
  fastify.post(
    '/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Solicitar recuperação de senha',
        body: forgotPasswordBodySchema,
        response: { 200: successResponseSchema },
      },
    },
    async (request, reply) => {
      return reply.send(await forgotPassword(fastify, request.body.email))
    },
  )

  /**
   * POST /auth/reset-password
   * Define a nova senha a partir do token de recovery do link do email.
   */
  fastify.post(
    '/reset-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Redefinir senha',
        body: resetPasswordBodySchema,
        response: {
          200: successResponseSchema,
          401: errorSchema.describe('Token de recuperação inválido ou expirado'),
        },
      },
    },
    async (request, reply) => {
      const { access_token, new_password } = request.body
      return reply.send(await resetPassword(fastify, access_token, new_password))
    },
  )

  /**
   * POST /auth/logout
   * Stub seguro — o cliente limpa o token local. Sempre 200.
   */
  fastify.post(
    '/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Logout',
        response: { 200: logoutResponseSchema },
      },
    },
    async (_request, reply) => {
      return reply.send(await logout())
    },
  )
}

export default authRoutes
