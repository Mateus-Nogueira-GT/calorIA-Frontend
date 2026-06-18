import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { createSystemPost } from '../feed/feed.service.js'
import type {
  Challenge,
  ChallengeDetail,
  ChallengeMember,
  CreateChallengeBody,
} from './challenges.schemas.js'

// ─── Criação e listagem ───────────────────────────────────────────────────────

export async function createChallenge(
  fastify: FastifyInstance,
  userId: string,
  data: CreateChallengeBody,
): Promise<Challenge> {
  return fastify.db.begin(async (sql) => {
    const [challenge] = await sql<Omit<Challenge, 'member_count'>[]>`
      INSERT INTO challenges (
        creator_id, title, description, rules, goal_type, target_value,
        duration_days, is_public, max_members
      ) VALUES (
        ${userId}, ${data.title}, ${data.description ?? null}, ${data.rules ?? null},
        ${data.goal_type}, ${data.target_value ?? null},
        ${data.duration_days}, ${data.is_public}, ${data.max_members}
      )
      RETURNING
        id, creator_id, title, description, rules, goal_type, target_value, duration_days,
        status, starts_at::TEXT AS starts_at, ends_at::TEXT AS ends_at,
        invite_code, is_public, max_members, created_at::TEXT AS created_at
    `

    await sql`
      INSERT INTO challenge_members (challenge_id, user_id, status)
      VALUES (${challenge.id}, ${userId}, 'active')
    `

    return { ...challenge, member_count: 1 }
  })
}

export async function listMyChallenges(
  fastify: FastifyInstance,
  userId: string,
): Promise<Challenge[]> {
  return fastify.db<Challenge[]>`
    SELECT
      c.id, c.creator_id, c.title, c.description, c.rules, c.goal_type, c.target_value, c.duration_days,
      c.status, c.starts_at::TEXT AS starts_at, c.ends_at::TEXT AS ends_at,
      c.invite_code, c.is_public, c.max_members, c.created_at::TEXT AS created_at,
      (SELECT COUNT(*) FROM challenge_members cm WHERE cm.challenge_id = c.id AND cm.status = 'active')::INT AS member_count
    FROM challenges c
    JOIN challenge_members me ON me.challenge_id = c.id AND me.user_id = ${userId}
    ORDER BY c.created_at DESC
  `
}

export async function getChallengeDetail(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<ChallengeDetail> {
  const [challenge] = await fastify.db<Omit<Challenge, 'member_count'>[]>`
    SELECT
      c.id, c.creator_id, c.title, c.description, c.rules, c.goal_type, c.target_value, c.duration_days,
      c.status, c.starts_at::TEXT AS starts_at, c.ends_at::TEXT AS ends_at,
      c.invite_code, c.is_public, c.max_members, c.created_at::TEXT AS created_at
    FROM challenges c
    JOIN challenge_members me ON me.challenge_id = c.id AND me.user_id = ${userId}
    WHERE c.id = ${challengeId}
  `
  if (!challenge) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Desafio não encontrado')

  const members = await fastify.db<ChallengeMember[]>`
    SELECT
      cm.id, cm.user_id, p.username, p.full_name, p.avatar_url,
      cm.status, cm.current_streak, cm.best_streak, cm.total_days,
      cm.last_check_in::TEXT AS last_check_in
    FROM challenge_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.challenge_id = ${challengeId}
    ORDER BY cm.current_streak DESC, cm.total_days DESC
  `

  return {
    ...challenge,
    member_count: members.filter((m) => m.status === 'active').length,
    members,
  }
}

// ─── Participação ─────────────────────────────────────────────────────────────

export async function joinChallengeByCode(
  fastify: FastifyInstance,
  userId: string,
  inviteCode: string,
): Promise<{ id: string }> {
  const [challenge] = await fastify.db<
    { id: string; status: string; max_members: number | null }[]
  >`
    SELECT id, status, max_members FROM challenges WHERE invite_code = ${inviteCode}
  `
  if (!challenge) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Código de convite inválido')
  if (challenge.status !== 'active')
    throw new AppError(409, 'CHALLENGE_NOT_ACTIVE', 'Este desafio não está ativo')

  const [existing] = await fastify.db<{ id: string; status: string }[]>`
    SELECT id, status FROM challenge_members WHERE challenge_id = ${challenge.id} AND user_id = ${userId}
  `
  if (existing?.status === 'active')
    throw new AppError(409, 'ALREADY_MEMBER', 'Você já participa deste desafio')

  if (challenge.max_members) {
    const [{ count }] = await fastify.db<{ count: number }[]>`
      SELECT COUNT(*)::INT AS count FROM challenge_members WHERE challenge_id = ${challenge.id} AND status = 'active'
    `
    if (count >= challenge.max_members)
      throw new AppError(409, 'CHALLENGE_FULL', 'Este desafio já atingiu o limite de participantes')
  }

  if (existing) {
    await fastify.db`UPDATE challenge_members SET status = 'active', updated_at = NOW() WHERE id = ${existing.id}`
  } else {
    await fastify.db`INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (${challenge.id}, ${userId}, 'active')`
  }

  const [{ title }] = await fastify.db<
    { title: string }[]
  >`SELECT title FROM challenges WHERE id = ${challenge.id}`
  await createSystemPost(fastify, userId, 'challenge_joined', `Entrou no desafio "${title}"!`, {
    challenge_id: challenge.id,
  })

  return { id: challenge.id }
}

export async function leaveChallenge(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<void> {
  const result = await fastify.db`
    UPDATE challenge_members SET status = 'quit', updated_at = NOW()
    WHERE challenge_id = ${challengeId} AND user_id = ${userId} AND status = 'active'
  `
  if (result.count === 0)
    throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'Você não participa ativamente deste desafio')
}

// ─── Check-in diário ────────────────────────────────────────────────────────

export async function checkIn(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<ChallengeMember> {
  const [member] = await fastify.db<{ id: string; status: string; last_check_in: string | null }[]>`
    SELECT id, status, last_check_in::TEXT AS last_check_in
    FROM challenge_members
    WHERE challenge_id = ${challengeId} AND user_id = ${userId}
  `
  if (!member) throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'Você não participa deste desafio')
  if (member.status !== 'active')
    throw new AppError(409, 'MEMBERSHIP_INACTIVE', 'Sua participação neste desafio não está ativa')

  const today = new Date().toISOString().slice(0, 10)
  if (member.last_check_in === today)
    throw new AppError(409, 'ALREADY_CHECKED_IN', 'Você já fez check-in hoje neste desafio')

  const [updated] = await fastify.db.begin(async (sql) => {
    await sql`INSERT INTO challenge_days (member_id, check_date) VALUES (${member.id}, ${today}) ON CONFLICT DO NOTHING`

    return sql<
      {
        id: string
        user_id: string
        status: string
        current_streak: number
        best_streak: number
        total_days: number
        last_check_in: string
      }[]
    >`
      UPDATE challenge_members
      SET
        current_streak = CASE
          WHEN last_check_in = ${today}::DATE - INTERVAL '1 day' THEN current_streak + 1
          ELSE 1
        END,
        best_streak = GREATEST(best_streak, CASE
          WHEN last_check_in = ${today}::DATE - INTERVAL '1 day' THEN current_streak + 1
          ELSE 1
        END),
        total_days = total_days + 1,
        last_check_in = ${today},
        updated_at = NOW()
      WHERE id = ${member.id}
      RETURNING id, user_id, status, current_streak, best_streak, total_days, last_check_in::TEXT AS last_check_in
    `
  })

  if (updated.current_streak > 0 && updated.current_streak % 7 === 0) {
    const [{ title }] = await fastify.db<
      { title: string }[]
    >`SELECT title FROM challenges WHERE id = ${challengeId}`
    await createSystemPost(
      fastify,
      userId,
      'streak_milestone',
      `${updated.current_streak} dias seguidos no desafio "${title}"! 🔥`,
      { challenge_id: challengeId, streak: updated.current_streak },
    )
  }

  const [profile] = await fastify.db<
    { username: string | null; full_name: string | null; avatar_url: string | null }[]
  >`
    SELECT username, full_name, avatar_url FROM profiles WHERE id = ${userId}
  `

  return { ...updated, ...profile } as unknown as ChallengeMember
}
