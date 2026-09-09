import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import type { Profile, UpdateProfileBody } from './users.schemas.js'

/**
 * Retorna o perfil completo do usuário autenticado.
 */
export async function getUserProfile(fastify: FastifyInstance, userId: string): Promise<Profile> {
  const [profile] = await fastify.db<Profile[]>`
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.avatar_emoji,
      p.weight_kg,
      p.height_cm,
      p.birth_date::TEXT AS birth_date,
      p.gender,
      p.goal,
      p.activity_level,
      p.body_type,
      p.coach_personality,
      p.coach_gender,
      p.dietary_restrictions,
      p.allergies,
      s.current_streak,
      p.created_at::TEXT AS created_at,
      p.updated_at::TEXT AS updated_at
    FROM profiles p
    LEFT JOIN streaks s ON s.user_id = p.id
    WHERE p.id = ${userId}
  `

  if (!profile) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado')
  }

  return profile
}

/**
 * Atualiza campos do perfil do usuário autenticado.
 * Apenas os campos enviados são alterados (partial update).
 */
export async function updateUserProfile(
  fastify: FastifyInstance,
  userId: string,
  data: UpdateProfileBody,
): Promise<Profile> {
  try {
    // postgres.js suporta sql(objeto) para gerar "col1 = $1, col2 = $2" dinamicamente
    const result = await fastify.db`
      UPDATE profiles
      SET
        ${fastify.db(data, ...(Object.keys(data) as (keyof UpdateProfileBody)[]))},
        updated_at = NOW()
      WHERE id = ${userId}
    `
    if (result.count === 0) {
      throw new AppError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado')
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new AppError(409, 'USERNAME_TAKEN', 'Este username já está em uso')
    }
    throw err
  }

  // Retorna o perfil completo (mesma projeção de getUserProfile, com todos os campos).
  return getUserProfile(fastify, userId)
}

/**
 * Sobe a foto de perfil (data URL base64) para o Storage e grava a URL pública.
 */
export async function uploadUserAvatar(
  fastify: FastifyInstance,
  userId: string,
  dataUrl: string,
): Promise<Profile> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new AppError(422, 'INVALID_IMAGE', 'Imagem inválida. Envie um data URL base64.')
  }

  const contentType = match[1]
  const buffer = Buffer.from(match[2], 'base64')
  const ext = (contentType.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await fastify.supabase.storage
    .from('avatars')
    .upload(path, buffer, { contentType, upsert: true })

  if (error) {
    fastify.log.error(error, 'Falha ao enviar avatar para o Storage')
    throw new AppError(502, 'UPLOAD_FAILED', 'Não foi possível enviar a imagem. Tente novamente.')
  }

  const {
    data: { publicUrl },
  } = fastify.supabase.storage.from('avatars').getPublicUrl(path)

  const result = await fastify.db`
    UPDATE profiles SET avatar_url = ${publicUrl}, updated_at = NOW() WHERE id = ${userId}
  `
  if (result.count === 0) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado')
  }

  // H3 da spec: remove as fotos antigas do prefixo do usuário (cada upload
  // criava um arquivo novo e os anteriores acumulavam para sempre).
  // Best-effort: falha aqui nunca derruba a troca de avatar.
  //
  // R2: estas duas idas ao Storage ficam DENTRO do request de propósito. A API
  // roda como função serverless na Vercel (vercel.json -> api/handler.js), e
  // ali o processo congela assim que a resposta sai: um fire-and-forget depois
  // do reply.send simplesmente não executaria, e o vazamento de storage que o
  // H3 fechou voltaria em silêncio. O gargalo que o usuário sentia era o
  // timeout de 10s do CLIENTE (corrigido para 75s em profile.service.ts), não
  // este trecho — a função tem maxDuration de 300s. Tirar daqui exige fila ou
  // cron, não um `void`.
  try {
    const { data: files } = await fastify.supabase.storage.from('avatars').list(userId)
    const stale = (files ?? [])
      .filter((f) => `${userId}/${f.name}` !== path)
      .map((f) => `${userId}/${f.name}`)
    if (stale.length > 0) {
      await fastify.supabase.storage.from('avatars').remove(stale)
    }
  } catch (err) {
    fastify.log.warn(err, 'Falha ao limpar avatares antigos do Storage')
  }

  return getUserProfile(fastify, userId)
}

/**
 * Exclui permanentemente a conta do usuário autenticado.
 *
 * A ordem importa: as fotos do Storage saem ANTES do usuário, porque os
 * arquivos não são alcançados por foreign key — se o auth.users sumisse
 * primeiro e o Storage falhasse, as imagens ficariam órfãs para sempre, sem
 * dono a partir do qual encontrá-las.
 *
 * Os dados do banco não são apagados aqui um a um: as 12 tabelas referenciam
 * auth.users(id) com ON DELETE CASCADE, então remover o usuário do Auth leva
 * junto perfil, refeições, dietas, feed, amizades, streaks e histórico. Fazer
 * DELETEs manuais além disso só criaria uma segunda lista para manter em dia a
 * cada tabela nova.
 */
export async function deleteUserAccount(fastify: FastifyInstance, userId: string): Promise<void> {
  // Best-effort: uma falha aqui não pode impedir o usuário de excluir a conta —
  // o direito à exclusão vale mais do que alguns arquivos órfãos no bucket.
  try {
    const { data: files } = await fastify.supabase.storage.from('avatars').list(userId)
    const paths = (files ?? []).map((f) => `${userId}/${f.name}`)
    if (paths.length > 0) {
      await fastify.supabase.storage.from('avatars').remove(paths)
    }
  } catch (err) {
    fastify.log.warn({ err, userId }, 'Falha ao remover avatares na exclusão de conta')
  }

  const { error } = await fastify.supabase.auth.admin.deleteUser(userId)

  if (error) {
    fastify.log.error({ err: error, userId }, 'Falha ao excluir conta')
    throw new AppError(502, 'DELETE_FAILED', 'Não foi possível excluir a conta. Tente novamente.')
  }

  fastify.log.info({ userId }, 'Conta excluída a pedido do usuário')
}
