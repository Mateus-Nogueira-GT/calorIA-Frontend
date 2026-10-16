import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { validateIdempotencyKey } from '../credits/credits.service.js'
interface InviteRow {
  id: string
  label: string | null
  status: string
  grant_units: number
  expires_at: Date
  created_at: Date
  claimed_by: string | null
}
export const hashInvite = (token: string) => createHash('sha256').update(token).digest('hex')
export function assertInvitesEnabled() {
  if (!env.CREDIT_INVITES_ENABLED) throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado')
}
export async function createInvite(
  f: FastifyInstance,
  creator: string,
  key: string | undefined,
  label?: string,
) {
  assertInvitesEnabled()
  const validatedKey = validateIdempotencyKey(key)
  const token = randomBytes(32).toString('base64url')
  const [created] = await f.db<
    InviteRow[]
  >`INSERT INTO credit_invites(token_hash,creator_id,idempotency_key,label,expires_at) VALUES(${hashInvite(token)},${creator},${validatedKey},${label ?? null},now()+interval '7 days') ON CONFLICT(creator_id,idempotency_key) DO NOTHING RETURNING id,label,status,grant_units,expires_at,created_at,claimed_by`
  if (created) return { ...created, url: `${env.INVITE_PUBLIC_URL.split('#')[0]}#${token}` }
  const [previous] = await f.db<
    InviteRow[]
  >`SELECT id,label,status,grant_units,expires_at,created_at,claimed_by FROM credit_invites WHERE creator_id=${creator} AND idempotency_key=${validatedKey}`
  if (previous.label !== (label ?? null))
    throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Esta tentativa já gerou outro convite.')
  return { ...previous, url: null }
}
export async function previewInvite(f: FastifyInstance, token: string) {
  assertInvitesEnabled()
  const [invite] =
    await f.db`SELECT grant_units,expires_at FROM credit_invites WHERE token_hash=${hashInvite(token)} AND status='active' AND expires_at>now()`
  if (!invite)
    throw new AppError(410, 'INVITE_UNAVAILABLE', 'Convite inválido, utilizado ou expirado.')
  return invite
}
export async function redeemInvite(f: FastifyInstance, userId: string, token: string) {
  assertInvitesEnabled()
  return f.db.begin(async (tx) => {
    await tx`INSERT INTO credit_wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`
    await tx`SELECT user_id FROM credit_wallets WHERE user_id=${userId} FOR UPDATE`
    const [invite] = await tx<
      { id: string; status: string; claimed_by: string | null; expired: boolean }[]
    >`SELECT id,status,claimed_by,expires_at<=now() AS expired FROM credit_invites WHERE token_hash=${hashInvite(token)} FOR UPDATE`
    if (!invite)
      throw new AppError(410, 'INVITE_UNAVAILABLE', 'Convite inválido, utilizado ou expirado.')
    const [prior] = await tx`SELECT invite_id FROM credit_welcome_claims WHERE user_id=${userId}`
    if (prior && prior.invite_id === invite.id) {
      const [w] =
        await tx`SELECT balance_units,balance_units-reserved_units AS available_units FROM credit_wallets WHERE user_id=${userId}`
      return { granted: false, grant_units: 75, ...w }
    }
    if (invite.status !== 'active' || invite.expired)
      throw new AppError(410, 'INVITE_UNAVAILABLE', 'Convite inválido, utilizado ou expirado.')
    if (prior)
      throw new AppError(
        409,
        'WELCOME_ALREADY_CLAIMED',
        'Você já recebeu os créditos de boas-vindas. Este convite continua disponível.',
      )
    await tx`INSERT INTO credit_welcome_claims(user_id,invite_id) VALUES(${userId},${invite.id})`
    await tx`UPDATE credit_invites SET status='used',claimed_by=${userId} WHERE id=${invite.id}`
    const [w] =
      await tx`UPDATE credit_wallets SET balance_units=balance_units+75 WHERE user_id=${userId} RETURNING balance_units,balance_units-reserved_units AS available_units`
    await tx`INSERT INTO credit_ledger(user_id,invite_id,actor_id,kind,units) VALUES(${userId},${invite.id},${userId},'welcome',75)`
    return { granted: true, grant_units: 75, ...w }
  })
}
