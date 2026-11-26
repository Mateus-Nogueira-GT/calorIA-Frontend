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
 * Conta criada só por Google ou Apple (sem senha): o login com senha sempre
 * falha, e "senha errada" confunde quem entra pelo botão no outro aparelho.
 * Falha na consulta → null (cai no genérico, nunca quebra o login).
 */
async function socialOnlyProvider(
  fastify: FastifyInstance,
  email: string,
): Promise<'google' | 'apple' | null> {
  try {
    const [row] = await fastify.db<{ has_password: boolean; providers: string[] }[]>`
      SELECT (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_password,
        COALESCE(array_agg(i.provider) FILTER (WHERE i.provider IS NOT NULL), '{}') AS providers
      FROM auth.users u LEFT JOIN auth.identities i ON i.user_id = u.id
      WHERE lower(u.email) = lower(${email})
      GROUP BY u.id LIMIT 1`
    if (!row || row.has_password) return null
    if (row.providers.includes('google')) return 'google'
    if (row.providers.includes('apple')) return 'apple'
    return null
  } catch (err) {
    fastify.log.warn({ err }, 'login_provider_lookup_failed')
    return null
  }
}

/**
 * Traduz a recusa do Supabase num motivo que o app consegue explicar. Antes,
 * tudo virava "credenciais inválidas" — inclusive conta do Google, e-mail não
 * confirmado e excesso de tentativas. O motivo vai para o log, sem o e-mail.
 */
async function loginError(
  fastify: FastifyInstance,
  email: string,
  error: unknown,
): Promise<AppError> {
  const code = (error as { code?: string } | null)?.code ?? null
  const status = (error as { status?: number } | null)?.status ?? null
  fastify.log.warn({ login_failed: { code, status } }, 'login_failed')
  if (code === 'email_not_confirmed')
    return new AppError(
      403,
      'EMAIL_NOT_CONFIRMED',
      'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    )
  if (status === 429 || code === 'over_request_rate_limit')
    return new AppError(
      429,
      'TOO_MANY_ATTEMPTS',
      'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    )
  if (status !== null && status >= 500)
    return new AppError(
      503,
      'AUTH_UNAVAILABLE',
      'Não foi possível entrar agora. Tente novamente em instantes.',
    )
  const provider = await socialOnlyProvider(fastify, email)
  if (provider === 'google')
    return new AppError(
      401,
      'GOOGLE_LOGIN_ACCOUNT',
      'Esta conta entra pelo Google. Toque em Continuar com Google.',
    )
  if (provider === 'apple')
    return new AppError(
      401,
      'APPLE_LOGIN_ACCOUNT',
      'Esta conta entra pela Apple. Toque em Continuar com Apple.',
    )
  return new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
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

  if (error || !session?.session) throw await loginError(fastify, data.email, error)

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
      email: session.user!.email ?? '',
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
  // E6 da spec: sem username o usuário fica invisível na busca de amigos —
  // o /register já derivava, mas o login social não. Idempotente (só se NULL).
  if (data.user.email) await ensureUsername(fastify, data.user.id, data.user.email)
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
  nonce?: string,
): Promise<AuthResponse> {
  const { data, error } = await fastify.supabaseAuth.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    // O nonce é obrigatório quando o token tem a claim `nonce` — e tem, porque
    // a lib do app gera um por padrão. Omiti-lo fazia o Supabase recusar TODO
    // login com Apple, que foi um dos motivos da rejeição na App Store.
    ...(nonce ? { nonce } : {}),
  })
  if (error) {
    // Sem log, a causa real (nonce, audience, provider desabilitado) ficava
    // invisível: o cliente só via "Login com Apple falhou".
    fastify.log.error({ err: error }, 'Supabase recusou o identity token da Apple')
  }
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

  // E6 da spec: mesmo caso do Google — garante username para a busca de amigos.
  if (data.user.email) await ensureUsername(fastify, data.user.id, data.user.email)

  return sessionToAuthResponse(data.session, data.user)
}

/**
 * Logout. O cliente limpa o token local; aqui revogamos a sessão no Supabase
 * (A6 do pente fino), para o refresh token deixar de renovar. Best-effort:
 * falha só gera log e a resposta é sempre 200.
 *
 * Escopo 'local': o default do signOut é 'global', que derrubaria os outros
 * aparelhos do usuário. O access token segue válido até o `exp` (verificação
 * local por JWKS); o que morre é o refresh.
 */
export async function logout(
  fastify: FastifyInstance,
  authorization: string | undefined,
): Promise<{ success: boolean }> {
  const jwt = /^Bearer (.+)$/i.exec(authorization ?? '')?.[1]?.trim()
  if (jwt) {
    try {
      const { error } = await fastify.supabase.auth.admin.signOut(jwt, 'local')
      if (error) fastify.log.warn({ err: error }, 'Falha ao revogar a sessão no logout')
    } catch (err) {
      fastify.log.warn({ err }, 'Falha ao revogar a sessão no logout')
    }
  }
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

/** Métodos do `amr` que provam posse do e-mail (link de recuperação). */
const RECOVERY_METHODS = new Set(['recovery', 'otp'])
const RECOVERY_MAX_AGE_S = 60 * 60

/**
 * Lê o `amr` do access token. Só roda DEPOIS do `getUser`, que já validou o
 * token no Supabase: aqui é só decodificação, sem confiar na assinatura.
 * O Supabase pode mandar objetos ({ method, timestamp }) ou strings (RFC 8176,
 * via hook de token). String não tem timestamp, então não prova recência.
 */
export function recoveryCheck(accessToken: string, nowS = Math.floor(Date.now() / 1000)) {
  let amr: unknown
  try {
    const part = accessToken.split('.')[1] ?? ''
    amr = (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { amr?: unknown }).amr
  } catch {
    amr = undefined
  }
  const entries = Array.isArray(amr) ? amr : []
  const format =
    amr === undefined
      ? 'absent'
      : !Array.isArray(amr)
        ? 'invalid'
        : entries.every((e) => typeof e === 'string')
          ? 'strings'
          : entries.every((e) => e && typeof e === 'object')
            ? 'objects'
            : 'mixed'
  const methods = entries
    .map((e) => (typeof e === 'string' ? e : (e as { method?: unknown })?.method))
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.slice(0, 40))
  const ages = entries
    .filter((e) => e && typeof e === 'object')
    .map((e) => e as { method?: unknown; timestamp?: unknown })
    .filter((e) => typeof e.method === 'string' && RECOVERY_METHODS.has(e.method))
    .map((e) => (typeof e.timestamp === 'number' ? nowS - e.timestamp : null))
    .filter((age): age is number => age !== null)
  const recoveryAge = ages.length ? Math.min(...ages) : null
  const ok = recoveryAge !== null && recoveryAge >= -60 && recoveryAge <= RECOVERY_MAX_AGE_S
  return { format, methods, recoveryAge, ok }
}

/**
 * Define a nova senha a partir do access_token de recovery (link do email).
 * Valida o token consultando o próprio Supabase; token inválido/expirado → 401.
 * A5: com AUTH_RESET_REQUIRE_RECOVERY=enforce, só aceita a sessão de
 * recuperação recente; em `log` (padrão) só registra. Depois da troca, encerra
 * as outras sessões do usuário (best-effort).
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

  const mode = env.AUTH_RESET_REQUIRE_RECOVERY
  const check = recoveryCheck(accessToken)
  // Sem token, e-mail nem id: só o formato, para decidir quando ligar o enforce.
  fastify.log.info(
    {
      reset_recovery: {
        mode,
        amr_format: check.format,
        methods: check.methods,
        recovery_age_s: check.recoveryAge,
        would_reject: !check.ok,
      },
    },
    'reset_password_recovery_check',
  )
  if (mode === 'enforce' && !check.ok) {
    throw new AppError(401, 'INVALID_RESET_TOKEN', 'Link de recuperação inválido ou expirado')
  }

  const { error: updateError } = await fastify.supabase.auth.admin.updateUserById(data.user.id, {
    password: newPassword,
  })
  if (updateError) {
    fastify.log.error({ err: updateError }, 'Falha ao redefinir senha')
    throw new AppError(500, 'RESET_FAILED', 'Não foi possível redefinir a senha. Tente novamente.')
  }

  // Quem tinha a senha antiga (ou um token roubado) perde as outras sessões.
  // A desta requisição (a de recuperação) fica; o access token já emitido
  // segue válido até o `exp`, o que morre é o refresh.
  try {
    const { error: signOutError } = await fastify.supabase.auth.admin.signOut(accessToken, 'others')
    if (signOutError) fastify.log.warn({ err: signOutError }, 'reset_password_signout_failed')
  } catch (err) {
    fastify.log.warn({ err }, 'reset_password_signout_failed')
  }

  return { success: true }
}
