import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { createSystemPost } from '../feed/feed.service.js'
import type { Challenge, ChallengeMember, CreateChallengeBody, LeaderboardEntry } from './challenges.schemas.js'

interface DbChallengeRow {
  id: string
  title: string
  description: string | null
  invite_code: string
  start_date: string
  end_date: string
  participant_count: number
  joined_by_me: boolean
}

function toChallenge(row: DbChallengeRow): Challenge {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    emoji: '🔥',
    startDate: row.start_date,
    endDate: row.end_date,
    participantCount: row.participant_count,
    metric: 'streak',
    joinedByMe: row.joined_by_me,
    inviteCode: row.invite_code,
  }
}

// Fragmento de colunas reutilizado (camelCase derivado: datas, contagem, joinedByMe).
function selectChallenge(fastify: FastifyInstance, userId: string) {
  return fastify.db`
    c.id, c.title, c.description, c.invite_code,
    c.starts_at::DATE::TEXT AS start_date,
    COALESCE(c.ends_at, c.starts_at + (c.duration_days || ' days')::interval)::DATE::TEXT AS end_date,
    (SELECT COUNT(*) FROM challenge_members cm WHERE cm.challenge_id = c.id AND cm.status = 'active')::INT AS participant_count,
    EXISTS (
      SELECT 1 FROM challenge_members me
      WHERE me.challenge_id = c.id AND me.user_id = ${userId} AND me.status = 'active'
    ) AS joined_by_me
  `
}

async function getChallengeById(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<Challenge> {
  const [row] = await fastify.db<DbChallengeRow[]>`
    SELECT ${selectChallenge(fastify, userId)}
    FROM challenges c
    WHERE c.id = ${challengeId}
  `
  if (!row) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Desafio não encontrado')
  return toChallenge(row)
}

// ─── Criação e listagem ───────────────────────────────────────────────────────

export async function createChallenge(
  fastify: FastifyInstance,
  userId: string,
  data: CreateChallengeBody,
): Promise<Challenge> {
  const durationDays = Math.max(
    1,
    Math.round((Date.parse(data.endDate) - Date.parse(data.startDate)) / 86_400_000),
  )

  const challengeId = await fastify.db.begin(async (sql) => {
    const [challenge] = await sql<{ id: string }[]>`
      INSERT INTO challenges (
        creator_id, title, description, goal_type, duration_days, starts_at, ends_at, is_public, max_members
      ) VALUES (
        ${userId}, ${data.title}, ${data.description}, 'streak', ${durationDays},
        ${data.startDate}, ${data.endDate}, false, 50
      )
      RETURNING id
    `
    await sql`
      INSERT INTO challenge_members (challenge_id, user_id, status)
      VALUES (${challenge.id}, ${userId}, 'active')
    `
    return challenge.id
  })

  return getChallengeById(fastify, userId, challengeId)
}

export async function listMyChallenges(
  fastify: FastifyInstance,
  userId: string,
): Promise<Challenge[]> {
  const rows = await fastify.db<DbChallengeRow[]>`
    SELECT ${selectChallenge(fastify, userId)}
    FROM challenges c
    JOIN challenge_members me2 ON me2.challenge_id = c.id AND me2.user_id = ${userId} AND me2.status = 'active'
    ORDER BY c.created_at DESC
  `
  return rows.map(toChallenge)
}

// ─── Participação ─────────────────────────────────────────────────────────────

export async function joinChallenge(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<Challenge> {
  const [challenge] = await fastify.db<
    { id: string; status: string; max_members: number | null; title: string }[]
  >`
    SELECT id, status, max_members, title FROM challenges WHERE id = ${challengeId}
  `
  if (!challenge) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Desafio não encontrado')
  if (challenge.status !== 'active')
    throw new AppError(409, 'CHALLENGE_NOT_ACTIVE', 'Este desafio não está ativo')

  const [existing] = await fastify.db<{ id: string; status: string }[]>`
    SELECT id, status FROM challenge_members WHERE challenge_id = ${challengeId} AND user_id = ${userId}
  `
  if (existing?.status === 'active')
    throw new AppError(409, 'ALREADY_MEMBER', 'Você já participa deste desafio')

  if (challenge.max_members) {
    const [{ count }] = await fastify.db<{ count: number }[]>`
      SELECT COUNT(*)::INT AS count FROM challenge_members WHERE challenge_id = ${challengeId} AND status = 'active'
    `
    if (count >= challenge.max_members)
      throw new AppError(409, 'CHALLENGE_FULL', 'Este desafio já atingiu o limite de participantes')
  }

  if (existing) {
    await fastify.db`UPDATE challenge_members SET status = 'active', updated_at = NOW() WHERE id = ${existing.id}`
  } else {
    await fastify.db`INSERT INTO challenge_members (challenge_id, user_id, status) VALUES (${challengeId}, ${userId}, 'active')`
  }

  try {
    await createSystemPost(fastify, userId, 'challenge_joined', `Entrou no desafio "${challenge.title}"!`, {
      challenge_id: challengeId,
    })
  } catch (err) {
    fastify.log.warn(err, 'Falha ao publicar post de entrada em desafio')
  }

  return getChallengeById(fastify, userId, challengeId)
}

export async function resolveInvite(
  fastify: FastifyInstance,
  userId: string,
  inviteCode: string,
): Promise<Challenge> {
  const [row] = await fastify.db<DbChallengeRow[]>`
    SELECT ${selectChallenge(fastify, userId)}
    FROM challenges c
    WHERE c.invite_code = ${inviteCode}
  `
  if (!row) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Código de convite inválido')
  return toChallenge(row)
}

export async function getLeaderboard(
  fastify: FastifyInstance,
  userId: string,
  challengeId: string,
): Promise<LeaderboardEntry[]> {
  const rows = await fastify.db<
    {
      user_id: string
      full_name: string | null
      username: string | null
      current_streak: number
    }[]
  >`
    SELECT cm.user_id, p.full_name, p.username, cm.current_streak
    FROM challenge_members cm
    JOIN profiles p ON p.id = cm.user_id
    WHERE cm.challenge_id = ${challengeId} AND cm.status = 'active'
    ORDER BY cm.current_streak DESC, cm.total_days DESC
  `

  return rows.map((r, i) => ({
    rank: i + 1,
    user: { id: r.user_id, name: r.full_name ?? r.username ?? 'Usuário' },
    streak: r.current_streak,
    isMe: r.user_id === userId,
  }))
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

    return sql<ChallengeMember[]>`
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

  return updated
}
