import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import type { Profile, UpdateProfileBody } from './users.schemas.js'

/**
 * Retorna o perfil completo do usuário autenticado.
 */
export async function getUserProfile(fastify: FastifyInstance, userId: string): Promise<Profile> {
  const [profile] = await fastify.db<Profile[]>`
    SELECT
      id,
      username,
      full_name,
      avatar_url,
      weight_kg,
      height_cm,
      birth_date::TEXT AS birth_date,
      gender,
      goal,
      activity_level,
      body_type,
      coach_personality,
      coach_gender,
      dietary_restrictions,
      allergies,
      created_at::TEXT AS created_at,
      updated_at::TEXT AS updated_at
    FROM profiles
    WHERE id = ${userId}
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
  let updated: Profile | undefined

  try {
    // postgres.js suporta sql(objeto) para gerar "col1 = $1, col2 = $2" dinamicamente
    ;[updated] = await fastify.db<Profile[]>`
      UPDATE profiles
      SET
        ${fastify.db(data, ...(Object.keys(data) as (keyof UpdateProfileBody)[]))},
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING
        id,
        username,
        full_name,
        avatar_url,
        weight_kg,
        height_cm,
        birth_date::TEXT AS birth_date,
        gender,
        goal,
        activity_level,
        dietary_restrictions,
        allergies,
        created_at::TEXT AS created_at,
        updated_at::TEXT AS updated_at
    `
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new AppError(409, 'USERNAME_TAKEN', 'Este username já está em uso')
    }
    throw err
  }

  if (!updated) {
    throw new AppError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado')
  }

  return updated
}
