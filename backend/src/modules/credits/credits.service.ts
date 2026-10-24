import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type postgres from 'postgres'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { CREDIT_POLICY } from './credit-policy.js'
import type { CreditReceipt } from './credits.schemas.js'
export type CreditTransaction = postgres.Sql | postgres.TransactionSql
interface Operation<T> {
  id: string
  state: string
  payload_hash: string
  result: T
  receipt: CreditReceipt
  fence: string
  cost_units: number
}
export interface CreditOperationInput {
  userId: string
  key?: string
  payload: unknown
  type: 'photo' | 'chat'
  costUnits: number
  conversationId?: string
}
export function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Atualize o aplicativo e tente novamente.')
  return key
}
/**
 * Cria a carteira na primeira vez, já com os créditos de boas-vindas e o
 * lançamento no extrato. ON CONFLICT torna a concessão única mesmo com
 * chamadas simultâneas: só quem efetivamente insere a carteira lança o crédito.
 * Carteiras anteriores a esta regra não são tocadas.
 */
export async function ensureWallet(tx: CreditTransaction, userId: string): Promise<void> {
  const created =
    await tx`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${userId},${CREDIT_POLICY.welcome_units}) ON CONFLICT DO NOTHING RETURNING user_id`
  if (created.length)
    await tx`INSERT INTO credit_ledger(user_id,kind,units) VALUES(${userId},'welcome',${CREDIT_POLICY.welcome_units})`
}
export async function wallet(fastify: FastifyInstance, userId: string) {
  if (!env.CREDITS_ENFORCEMENT_ENABLED && !env.CREDIT_INVITES_ENABLED)
    return { balance_units: 0, reserved_units: 0, available_units: 0, unlimited: false }
  const [row] = await fastify.db.begin(async (tx) => {
    await ensureWallet(tx, userId)
    return tx<
      { balance_units: number; reserved_units: number; unlimited: boolean }[]
    >`SELECT balance_units,reserved_units,unlimited FROM credit_wallets WHERE user_id=${userId}`
  })
  return {
    balance_units: row?.balance_units ?? 0,
    reserved_units: row?.reserved_units ?? 0,
    available_units: (row?.balance_units ?? 0) - (row?.reserved_units ?? 0),
    unlimited: row?.unlimited ?? false,
  }
}
/** Fencing and release share one transaction: a late provider completion can never debit after recovery. */
export async function reconcileCreditOperations(fastify: FastifyInstance, userId: string) {
  await fastify.db.begin(async (tx) => {
    // Wallet first everywhere (including settlement) prevents lock-order deadlocks.
    await tx`SELECT user_id FROM credit_wallets WHERE user_id=${userId} FOR UPDATE`
    const expired = await tx<
      { id: string; cost_units: number }[]
    >`UPDATE credit_operations SET state='failed',fence=${randomUUID()},updated_at=now() WHERE user_id=${userId} AND state IN ('running','uncertain') AND lease_expires_at<now() RETURNING id,cost_units`
    if (expired.length) {
      await tx`UPDATE credit_wallets SET reserved_units=reserved_units-${expired.reduce((n, o) => n + o.cost_units, 0)} WHERE user_id=${userId}`
      await tx`DELETE FROM credit_conversation_leases WHERE operation_id IN ${tx(expired.map((o) => o.id))}`
    }
  })
}
/** Owner cancellation is durable even when it arrives before the original request. */
export async function cancelCreditOperation(
  fastify: FastifyInstance,
  userId: string,
  keyInput: string,
) {
  const key = validateIdempotencyKey(keyInput)
  if (!env.CREDITS_ENFORCEMENT_ENABLED) return { state: 'disabled' as const, operation_id: null }
  return fastify.db.begin(async (tx) => {
    await ensureWallet(tx, userId)
    await tx`SELECT user_id FROM credit_wallets WHERE user_id=${userId} FOR UPDATE`
    const [op] = await tx<
      Operation<unknown>[]
    >`SELECT * FROM credit_operations WHERE user_id=${userId} AND idempotency_key=${key} FOR UPDATE`
    if (op?.state === 'succeeded')
      return { state: 'succeeded' as const, operation_id: op.id, receipt: op.receipt }
    await tx`INSERT INTO credit_cancellations(user_id,idempotency_key) VALUES(${userId},${key}) ON CONFLICT DO NOTHING`
    if (op && (op.state === 'running' || op.state === 'uncertain')) {
      await tx`UPDATE credit_operations SET state='failed',fence=${randomUUID()},updated_at=now() WHERE id=${op.id}`
      await tx`UPDATE credit_wallets SET reserved_units=reserved_units-${op.cost_units} WHERE user_id=${userId}`
      await tx`DELETE FROM credit_conversation_leases WHERE operation_id=${op.id}`
    }
    return { state: 'cancelled' as const, operation_id: op?.id ?? null }
  })
}
export async function runCreditOperation<T>(
  fastify: FastifyInstance,
  input: CreditOperationInput,
  infer: () => Promise<T>,
  persist?: (tx: CreditTransaction, result: T) => Promise<void>,
): Promise<{ result: T; receipt: CreditReceipt | null }> {
  // Sem cobrança: cobrança desligada ou conta ilimitada. Nenhuma linha de crédito é criada.
  const uncharged = async () => {
    const result = await infer()
    await persist?.(fastify.db, result)
    return { result, receipt: null }
  }
  if (!env.CREDITS_ENFORCEMENT_ENABLED) return uncharged()
  const key = validateIdempotencyKey(input.key)
  const expected =
    input.type === 'photo' ? CREDIT_POLICY.photo_units : 2 * CREDIT_POLICY.message_units
  if (input.costUnits !== expected)
    throw new AppError(503, 'CREDIT_POLICY_UNAVAILABLE', 'Tarifa indisponível.')
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        type: input.type,
        costUnits: input.costUnits,
        conversationId: input.conversationId ?? null,
        payload: input.payload,
      }),
    )
    .digest('hex')
  const id = randomUUID()
  const fence = randomUUID()
  let existing: Operation<T> | undefined
  let unlimited = false
  try {
    await reconcileCreditOperations(fastify, input.userId)
    await fastify.db.begin(async (tx) => {
      await ensureWallet(tx, input.userId)
      const [w] = await tx<
        { balance_units: number; reserved_units: number; unlimited: boolean }[]
      >`SELECT balance_units,reserved_units,unlimited FROM credit_wallets WHERE user_id=${input.userId} FOR UPDATE`
      ;[existing] = await tx<
        Operation<T>[]
      >`SELECT * FROM credit_operations WHERE user_id=${input.userId} AND idempotency_key=${key}`
      const cancelled =
        await tx`SELECT user_id FROM credit_cancellations WHERE user_id=${input.userId} AND idempotency_key=${key}`
      if (cancelled.length && existing?.state !== 'succeeded')
        throw new AppError(409, 'OPERATION_CANCELLED', 'Esta tentativa foi cancelada sem cobrança.')
      if (existing) {
        if (existing.payload_hash !== hash)
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Esta tentativa pertence a outra operação.',
          )
        return
      }
      // Operação já reservada antes de ligar o ilimitado segue o fluxo acima e é debitada.
      if (w.unlimited) {
        unlimited = true
        return
      }
      if (w.balance_units - w.reserved_units < input.costUnits)
        throw new AppError(
          402,
          'INSUFFICIENT_CREDITS',
          'Créditos insuficientes. Confira seu saldo.',
          { available_units: w.balance_units - w.reserved_units, required_units: input.costUnits },
        )
      if (input.conversationId) {
        const lease =
          await tx`SELECT operation_id FROM credit_conversation_leases WHERE user_id=${input.userId} AND conversation_id=${input.conversationId}`
        if (lease.length)
          throw new AppError(409, 'CONVERSATION_BUSY', 'Aguarde a resposta anterior.')
      }
      await tx`INSERT INTO credit_operations(id,user_id,type,idempotency_key,payload_hash,cost_units,policy_version,state,fence,lease_expires_at,conversation_id) VALUES(${id},${input.userId},${input.type},${key},${hash},${input.costUnits},${CREDIT_POLICY.version},'running',${fence},now()+interval '5 minutes',${input.conversationId ?? null})`
      if (input.conversationId)
        await tx`INSERT INTO credit_conversation_leases(user_id,conversation_id,operation_id) VALUES(${input.userId},${input.conversationId},${id})`
      await tx`UPDATE credit_wallets SET reserved_units=reserved_units+${input.costUnits} WHERE user_id=${input.userId}`
    })
  } catch (err) {
    if (err instanceof AppError) throw err
    fastify.log.error({ err }, 'Credit reservation failed')
    throw new AppError(503, 'CREDITS_UNAVAILABLE', 'Não foi possível consultar os créditos.')
  }
  if (unlimited) return uncharged()
  if (existing) {
    if (existing.state === 'succeeded')
      return { result: existing.result, receipt: existing.receipt }
    throw new AppError(
      409,
      existing.state === 'failed' ? 'OPERATION_FAILED' : 'OPERATION_PENDING',
      existing.state === 'failed'
        ? 'Esta tentativa falhou. Inicie uma nova tentativa.'
        : 'Sua operação ainda está sendo processada.',
    )
  }
  try {
    const result = await infer()
    const settled = await fastify.db.begin(async (tx) => {
      await tx`SELECT user_id FROM credit_wallets WHERE user_id=${input.userId} FOR UPDATE`
      const [op] = await tx<
        Operation<T>[]
      >`SELECT * FROM credit_operations WHERE id=${id} AND fence=${fence} AND state='running' FOR UPDATE`
      // D06: now() é o início da transação e não anda durante a espera pelo
      // lock. O prazo é conferido num comando separado, já com os locks, contra
      // o relógio real.
      const [lease] = op
        ? await tx<
            { expired: boolean }[]
          >`SELECT lease_expires_at < clock_timestamp() AS expired FROM credit_operations WHERE id=${id}`
        : []
      if (!op || lease?.expired !== false)
        throw new AppError(409, 'OPERATION_EXPIRED', 'Esta tentativa expirou sem cobrança.')
      await persist?.(tx, result)
      const [w] = await tx<
        { balance_units: number; reserved_units: number }[]
      >`UPDATE credit_wallets SET balance_units=balance_units-${input.costUnits},reserved_units=reserved_units-${input.costUnits} WHERE user_id=${input.userId} RETURNING balance_units,reserved_units`
      const receipt = {
        operation_id: id,
        charged_units: input.costUnits,
        balance_units: w.balance_units,
        available_units: w.balance_units - w.reserved_units,
      }
      await tx`INSERT INTO credit_ledger(user_id,operation_id,kind,units) VALUES(${input.userId},${id},'debit',${-input.costUnits})`
      await tx`UPDATE credit_operations SET state='succeeded',result=${tx.json(result as postgres.JSONValue)},receipt=${tx.json(receipt)},updated_at=now() WHERE id=${id}`
      await tx`DELETE FROM credit_conversation_leases WHERE operation_id=${id}`
      return receipt
    })
    return { result, receipt: settled as CreditReceipt }
  } catch (err) {
    // If settlement's commit acknowledgement was lost, never undo a committed debit.
    try {
      await fastify.db.begin(async (tx) => {
        await tx`SELECT user_id FROM credit_wallets WHERE user_id=${input.userId} FOR UPDATE`
        const rows =
          await tx`UPDATE credit_operations SET state='failed',fence=${randomUUID()},updated_at=now() WHERE id=${id} AND fence=${fence} AND state='running' RETURNING id`
        if (rows.length) {
          await tx`UPDATE credit_wallets SET reserved_units=reserved_units-${input.costUnits} WHERE user_id=${input.userId}`
          await tx`DELETE FROM credit_conversation_leases WHERE operation_id=${id}`
        }
      })
    } catch (releaseError) {
      fastify.log.error(
        { err: releaseError, operationId: id },
        'Credit release deferred to fenced recovery',
      )
    }
    if (err instanceof AppError) throw err
    fastify.log.error({ err, operationId: id }, 'Credit operation failed')
    throw new AppError(
      503,
      'CREDITS_UNAVAILABLE',
      'Não foi possível concluir a operação. Consulte a tentativa antes de reenviar.',
    )
  }
}
