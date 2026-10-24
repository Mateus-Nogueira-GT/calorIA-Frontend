import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import { CREDIT_POLICY } from './credit-policy.js'
import { type CreditTransaction, ensureWallet, validateIdempotencyKey } from './credits.service.js'

const MAX_GRANT_CREDITS = 1000

async function assertUserExists(tx: CreditTransaction, userId: string) {
  const [profile] = await tx`SELECT id FROM profiles WHERE id=${userId}`
  if (!profile) throw new AppError(404, 'USER_NOT_FOUND', 'Conta não encontrada.')
}

/**
 * Libera créditos manualmente. A chave de idempotência é única por admin: o
 * INSERT só devolve linha na primeira vez, e só então o saldo é somado — uma
 * repetição devolve o estado atual da carteira sem creditar de novo.
 */
export async function grantCredits(
  f: FastifyInstance,
  adminId: string,
  userId: string,
  credits: number,
  key: string | undefined,
  note?: string,
): Promise<{ balance_units: number; available_units: number; unlimited: boolean }> {
  const idempotencyKey = validateIdempotencyKey(key)
  if (!Number.isInteger(credits) || credits < 1 || credits > MAX_GRANT_CREDITS)
    throw new AppError(422, 'INVALID_GRANT', 'Informe de 1 a 1.000 créditos.')
  const units = credits * CREDIT_POLICY.units_per_credit
  const cleanNote = note?.trim() || null
  return f.db.begin(async (tx) => {
    await assertUserExists(tx, userId)
    await ensureWallet(tx, userId)
    // Trava a carteira: concessões simultâneas à mesma conta se serializam.
    await tx`SELECT user_id FROM credit_wallets WHERE user_id=${userId} FOR UPDATE`
    const inserted =
      await tx`INSERT INTO credit_ledger(user_id,actor_id,kind,units,note,idempotency_key)
      VALUES(${userId},${adminId},'grant',${units},${cleanNote},${idempotencyKey})
      ON CONFLICT (actor_id, idempotency_key) DO NOTHING RETURNING id`
    if (inserted.length)
      await tx`UPDATE credit_wallets SET balance_units=balance_units+${units} WHERE user_id=${userId}`
    const [row] = await tx<
      { balance_units: number; reserved_units: number; unlimited: boolean }[]
    >`SELECT balance_units,reserved_units,unlimited FROM credit_wallets WHERE user_id=${userId}`
    return {
      balance_units: row.balance_units,
      available_units: row.balance_units - row.reserved_units,
      unlimited: row.unlimited,
    }
  })
}

/** Ao desligar, unlimited_by/unlimited_since ficam como registro da última ativação. */
export async function setUnlimited(
  f: FastifyInstance,
  adminId: string,
  userId: string,
  unlimited: boolean,
): Promise<{ unlimited: boolean }> {
  return f.db.begin(async (tx) => {
    await assertUserExists(tx, userId)
    await ensureWallet(tx, userId)
    await tx`SELECT user_id FROM credit_wallets WHERE user_id=${userId} FOR UPDATE`
    if (unlimited)
      await tx`UPDATE credit_wallets SET unlimited=true,unlimited_by=${adminId},unlimited_since=now() WHERE user_id=${userId}`
    else await tx`UPDATE credit_wallets SET unlimited=false WHERE user_id=${userId}`
    return { unlimited }
  })
}
