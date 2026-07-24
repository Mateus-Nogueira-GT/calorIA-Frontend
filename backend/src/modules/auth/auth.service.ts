import type { Session, User } from '@supabase/supabase-js'
import type { FastifyInstance } from 'fastify'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { AuthResponse, LoginBody, RefreshBody, RegisterBody } from './auth.schemas.js'

/** Mapeia uma sessão do Supabase para o shape de resposta de auth da API. */
function sessionToAuthResponse(session: Session, user: User): AuthResponse {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    expires_in: session.expires_in ?? 3600,
    user: {
      id: user.id,
      email: user.email ?? '',
      name: (user.user_metadata?.name as string) ?? null,
    },
  }
}

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

  // Deriva um username (a busca/pedido de amizade dependem dele; sem isso fica NULL).
  await ensureUsername(fastify, createdUser.user.id, data.email)

  // Faz login para retornar os tokens
  return loginUser(fastify, { email: data.email, password: data.password })
}

/**
 * Garante um username no perfil quando ainda é NULL, derivando do email.
 * Best-effort: nunca bloqueia o cadastro. Tenta sufixos aleatórios em caso de
 * colisão (a coluna username é UNIQUE).
 */
async function ensureUsername(
  fastify: FastifyInstance,
  userId: string,
  email: string,
): Promise<void> {
  const base =
    (email.split('@')[0] ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || 'user'

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? '' : String(1000 + Math.floor(Math.random() * 9000))
    const candidate = `${base}${suffix}`.slice(0, 30)
    try {
      await fastify.db`
        UPDATE profiles SET username = ${candidate}
        WHERE id = ${userId} AND username IS NULL
      `
      return
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === '23505') continue
      fastify.log.warn(err, 'Falha ao derivar username')
      return
    }
  }
}

/**
 * Autentica um usuário com email e senha.
 * Retorna access_token (JWT), refresh_token e dados básicos do usuário.
 */
export async function loginUser(fastify: FastifyInstance, data: LoginBody): Promise<AuthResponse> {
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

/**
 * Login social via Google — valida o id_token no Supabase.
 */
export async function googleLogin(
  fastify: FastifyInstance,
  idToken: string,
): Promise<AuthResponse> {
  const { data, error } = await fastify.supabaseAuth.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error || !data.session || !data.user) {
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Não foi possível autenticar com o Google')
  }
  return sessionToAuthResponse(data.session, data.user)
}

/**
 * Login social via Apple — valida o identity_token no Supabase.
 * Se o nome vier do provedor (só no 1º login), preenche o perfil.
 */
export async function appleLogin(
  fastify: FastifyInstance,
  identityToken: string,
  fullName?: string,
): Promise<AuthResponse> {
  const { data, error } = await fastify.supabaseAuth.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  })
  if (error || !data.session || !data.user) {
    throw new AppError(401, 'APPLE_AUTH_FAILED', 'Não foi possível autenticar com a Apple')
  }

  if (fullName) {
    try {
      await fastify.db`
        UPDATE profiles SET full_name = COALESCE(full_name, ${fullName}) WHERE id = ${data.user.id}
      `
    } catch (err) {
      fastify.log.warn(err, 'Falha ao preencher nome no login com Apple')
    }
  }

  return sessionToAuthResponse(data.session, data.user)
}

/**
 * Logout — stub seguro. O cliente já limpa o token local; sempre retorna 200.
 */
export async function logout(): Promise<{ success: boolean }> {
  return { success: true }
}

/**
 * Envia o email de recuperação de senha via Supabase.
 * SEMPRE responde sucesso — não revelar se o email existe (enumeração).
 */
export async function forgotPassword(
  fastify: FastifyInstance,
  email: string,
): Promise<{ success: boolean }> {
  const redirectTo = env.PASSWORD_RESET_REDIRECT_URL
  const { error } = await fastify.supabaseAuth.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  )
  if (error) {
    // Loga mas não expõe: resposta é a mesma com ou sem conta.
    fastify.log.warn({ err: error }, 'Falha ao enviar email de recuperação')
  }
  return { success: true }
}

/**
 * Define a nova senha a partir do access_token de recovery (link do email).
 * Valida o token consultando o próprio Supabase; token inválido/expirado → 401.
 */
export async function resetPassword(
  fastify: FastifyInstance,
  accessToken: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  const { data, error } = await fastify.supabaseAuth.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw new AppError(401, 'INVALID_RESET_TOKEN', 'Link de recuperação inválido ou expirado')
  }

  const { error: updateError } = await fastify.supabase.auth.admin.updateUserById(data.user.id, {
    password: newPassword,
  })
  if (updateError) {
    fastify.log.error({ err: updateError }, 'Falha ao redefinir senha')
    throw new AppError(500, 'RESET_FAILED', 'Não foi possível redefinir a senha. Tente novamente.')
  }

  return { success: true }
}
