import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import type { RegisterBody, LoginBody, RefreshBody, AuthResponse } from './auth.schemas.js'

/**
 * Cadastra um novo usuário via Supabase Auth.
 * Após criar o usuário, já retorna a sessão autenticada.
 */
export async function registerUser(
  fastify: FastifyInstance,
  data: RegisterBody,
): Promise<AuthResponse> {
  // Cria o usuário via admin (confirma o email automaticamente)
  const { data: createdUser, error: createError } = await fastify.supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { name: data.name },
  })

  if (createError) {
    const msg = createError.message.toLowerCase()
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Este email já está cadastrado')
    }
    fastify.log.error({ err: createError }, 'Erro ao criar usuário')
    throw new AppError(500, 'AUTH_ERROR', 'Erro ao criar conta')
  }

  if (!createdUser?.user) {
    throw new AppError(500, 'AUTH_ERROR', 'Erro ao criar conta')
  }

  // O trigger no banco já cria o perfil automaticamente.
  // Caso o trigger falhe, garantimos a criação aqui também.
  await fastify.db`
    INSERT INTO profiles (id, full_name)
    VALUES (${createdUser.user.id}, ${data.name})
    ON CONFLICT (id) DO NOTHING
  `

  // Faz login para retornar os tokens
  return loginUser(fastify, { email: data.email, password: data.password })
}

/**
 * Autentica um usuário com email e senha.
 * Retorna access_token (JWT), refresh_token e dados básicos do usuário.
 */
export async function loginUser(
  fastify: FastifyInstance,
  data: LoginBody,
): Promise<AuthResponse> {
  const { data: session, error } = await fastify.supabaseAuth.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (error || !session?.session) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou senha inválidos')
  }

  return {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    token_type: 'bearer',
    expires_in: session.session.expires_in ?? 3600,
    user: {
      id: session.user.id,
      email: session.user.email!,
      name: (session.user.user_metadata?.name as string) ?? null,
    },
  }
}

/**
 * Renova o access_token usando o refresh_token.
 */
export async function refreshSession(
  fastify: FastifyInstance,
  data: RefreshBody,
): Promise<AuthResponse> {
  const { data: session, error } = await fastify.supabaseAuth.auth.refreshSession({
    refresh_token: data.refresh_token,
  })

  if (error || !session?.session) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido ou expirado')
  }

  return {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    token_type: 'bearer',
    expires_in: session.session.expires_in ?? 3600,
    user: {
      id: session.user!.id,
      email: session.user!.email!,
      name: (session.user!.user_metadata?.name as string) ?? null,
    },
  }
}
