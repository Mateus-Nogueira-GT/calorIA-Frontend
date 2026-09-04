import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { isWithinDateWindow, utcTodayString } from '../../shared/local-date.js'
import { createSystemPost } from '../feed/feed.service.js'
import type {
  Challenge,
  ChallengeMember,
  CreateChallengeBody,
  LeaderboardEntry,
} from './challenges.schemas.js'

interface DbChallengeRow {
  id: string
  title: string
  description: string | null
  invite_code: string
  start_date: string
  end_date: string
  participant_count: number
  joined_by_me: boolean
  is_finished: boolean
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
    finished: row.is_finished,
  }
}

// Fragmento de colunas reutilizado (camelCase derivado: datas, contagem, joinedByMe).
// `is_finished` é DERIVADO da data (F3 da spec) — nenhum cron muda status.
function selectChallenge(fastify: FastifyInstance, userId: string) {
  return fastify.db`
    c.id, c.title, c.description, c.invite_code,
    c.starts_at::DATE::TEXT AS start_date,
    COALESCE(c.ends_at, c.starts_at + (c.duration_days || ' days')::interval)::DATE::TEXT AS end_date,
    (COALESCE(c.ends_at, c.starts_at + (c.duration_days || ' days')::interval)::DATE < CURRENT_DATE) AS is_finished,
    (SELECT COUNT(*) FROM challenge_members cm WHERE cm.challenge_id = c.id AND cm.status = 'active')::INT AS participant_count,
    EXISTS (
      SELECT 1 FROM challenge_members me
      WHERE me.challenge_id = c.id AND me.user_id = ${userId} AND me.status = 'active'
    ) AS joined_by_me
  `
}

/** Data-fim efetiva (ends_at ou starts_at + duração) como 'YYYY-MM-DD'. */
async function getChallengeEndDate(
  fastify: FastifyInstance,
  challengeId: string,
): Promise<string | null> {
  const [row] = await fastify.db<{ end_date: string | null }[]>`
    SELECT COALESCE(ends_at, starts_at + (duration_days || ' days')::interval)::DATE::TEXT AS end_date
    FROM challenges WHERE id = ${challengeId}
  `
  return row?.end_date ?? null
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

  // F2: não se entra em desafio que já terminou.
  const endDate = await getChallengeEndDate(fastify, challengeId)
  if (endDate && utcTodayString() > endDate)
    throw new AppError(409, 'CHALLENGE_ENDED', 'Este desafio já foi encerrado')

  const [existing] = await fastify.db<{ id: string; status: string }[]>`
    SELECT id, status FROM challenge_members WHERE challenge_id = ${challengeId} AND user_id = ${userId}
  `
  if (existing?.status === 'active')
    throw new AppError(409, 'ALREADY_MEMBER', 'Você já participa deste desafio')

  // F4: a checagem de lotação entra na PRÓPRIA statement (check-then-insert
  // permitia estourar max_members com joins concorrentes).
  const capacity = challenge.max_members ?? 1_000_000
  const result = existing
    ? await fastify.db`
        UPDATE challenge_members SET status = 'active', updated_at = NOW()
        WHERE id = ${existing.id}
          AND (SELECT COUNT(*) FROM challenge_members
               WHERE challenge_id = ${challengeId} AND status = 'active') < ${capacity}
      `
    : await fastify.db`
        INSERT INTO challenge_members (challenge_id, user_id, status)
        SELECT ${challengeId}, ${userId}, 'active'
        WHERE (SELECT COUNT(*) FROM challenge_members
               WHERE challenge_id = ${challengeId} AND status = 'active') < ${capacity}
      `
  if (result.count === 0)
    throw new AppError(409, 'CHALLENGE_FULL', 'Este desafio já atingiu o limite de participantes')

  try {
    await createSystemPost(
      fastify,
      userId,
      'challenge_joined',
      `Entrou no desafio "${challenge.title}"!`,
      {
        challenge_id: challengeId,
      },
    )
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
  // M4: o ranking expõe nome/username e desempenho de todos os participantes.
  // Sem esta checagem, qualquer usuário autenticado que obtivesse um id de
  // desafio (link de convite repassado, id vindo do feed) lia a lista inteira
  // de um grupo privado do qual não faz parte. Era o único endpoint destes
  // módulos sem verificação de vínculo.
  const [challenge] = await fastify.db<{ is_public: boolean; is_member: boolean }[]>`
    SELECT
      COALESCE(c.is_public, FALSE) AS is_public,
      EXISTS (
        SELECT 1 FROM challenge_members m
        WHERE m.challenge_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member
    FROM challenges c
    WHERE c.id = ${challengeId}
  `

  if (!challenge) throw new AppError(404, 'CHALLENGE_NOT_FOUND', 'Desafio não encontrado')
  // Não-membro de desafio privado recebe lista VAZIA, não 403. O IDOR continua
  // fechado (nenhum nome sai daqui), mas o 403 quebrava o fluxo de CONVITE: o
  // app resolve o código, insere o desafio na lista local e em seguida busca o
  // ranking — e o convidado ainda não é membro. Com 403 a primeira tela que ele
  // via era "Algo deu errado" com um retry que nunca funcionaria. Isso atinge o
  // app já publicado na Play (que não pode mudar), então a correção tem de ser
  // aqui: vazio renderiza cabeçalho + "Ranking ainda vazio." e o "Participar"
  // segue alcançável na aba de desafios.
  if (!challenge.is_public && !challenge.is_member) return []

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
  localDate?: string,
): Promise<ChallengeMember> {
  // A8: data local do cliente, limitada a ±1 dia do UTC (fusos reais); o
  // check-in não é retroativo.
  if (localDate && !isWithinDateWindow(localDate, new Date(), { pastDays: 1, futureDays: 1 })) {
    throw new AppError(400, 'INVALID_DATE', 'Data fora da janela permitida para check-in')
  }

  const [member] = await fastify.db<{ id: string; status: string; last_check_in: string | null }[]>`
    SELECT id, status, last_check_in::TEXT AS last_check_in
    FROM challenge_members
    WHERE challenge_id = ${challengeId} AND user_id = ${userId}
  `
  if (!member) throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'Você não participa deste desafio')
  if (member.status !== 'active')
    throw new AppError(409, 'MEMBERSHIP_INACTIVE', 'Sua participação neste desafio não está ativa')

  const today = localDate ?? utcTodayString()

  // F2: check-in só até a data-fim — sem isso o desafio era "eterno".
  const endDate = await getChallengeEndDate(fastify, challengeId)
  if (endDate && today > endDate)
    throw new AppError(409, 'CHALLENGE_ENDED', 'Este desafio já foi encerrado')

  if (member.last_check_in === today)
    throw new AppError(409, 'ALREADY_CHECKED_IN', 'Você já fez check-in hoje neste desafio')

  const [updated] = await fastify.db.begin(async (sql) => {
    await sql`INSERT INTO challenge_days (member_id, check_date) VALUES (${member.id}, ${today}) ON CONFLICT DO NOTHING`

    // B3: a guarda `member.last_check_in === today` acima é check-then-act — dois
    // toques rápidos passavam os dois. A segunda transação lia last_check_in=hoje,
    // o CASE dava falso e caía no ELSE 1: quem tinha 5 dias de sequência ficava
    // com 1, e total_days incrementava em dobro. Repetimos a condição DENTRO do
    // UPDATE, onde ela é avaliada sob o lock da linha; 0 linhas = já fez hoje.
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
        AND last_check_in IS DISTINCT FROM ${today}::DATE
      RETURNING id, user_id, status, current_streak, best_streak, total_days, last_check_in::TEXT AS last_check_in
    `
  })

  if (!updated)
    throw new AppError(409, 'ALREADY_CHECKED_IN', 'Você já fez check-in hoje neste desafio')

  // L5: best-effort, como em joinChallenge. O check-in já está commitado neste
  // ponto — uma falha ao publicar o marco devolvia 500, o usuário lia "não foi
  // possível fazer o check-in" e ao tentar de novo batia em ALREADY_CHECKED_IN.
  if (updated.current_streak > 0 && updated.current_streak % 7 === 0) {
    try {
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
    } catch (err) {
      fastify.log.warn({ err }, 'Falha ao publicar marco de streak do desafio')
    }
  }

  return updated
}
