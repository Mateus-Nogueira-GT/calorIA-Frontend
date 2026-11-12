import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { AsaasClient } from './asaas.client.js'
import { normalizeCpfCnpj } from './cpf-cnpj.js'
import { saoPauloDate } from './subscriptions.service.js'

/** Recarga de créditos (spec 2026-11-12): pacote avulso pago por cobrança única no Asaas. */

export const packageCodeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Use letras minúsculas, dígitos, - ou _')

const packageFields = {
  name: z.string().trim().min(1).max(60),
  credits: z.number().int().min(1).max(100_000),
  // R$ 5,00 é o mínimo de cobrança do Asaas.
  price_cents: z.number().int().min(500).max(1_000_000),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(1000),
}

export const createPackageBodySchema = z.object({
  code: packageCodeSchema,
  ...packageFields,
  active: packageFields.active.default(true),
  sort_order: packageFields.sort_order.default(0),
})
export type CreatePackageBody = z.infer<typeof createPackageBodySchema>

export const updatePackageBodySchema = z
  .object(packageFields)
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nada para alterar.' })
export type UpdatePackageBody = z.infer<typeof updatePackageBodySchema>

export const purchaseCheckoutBodySchema = z.object({
  package_code: z.string().min(2).max(40),
  cpf_cnpj: z.string().min(11).max(18).optional(),
  name: z.string().trim().min(2).max(100).optional(),
})
export type PurchaseCheckoutBody = z.infer<typeof purchaseCheckoutBodySchema>

export interface PublicPackage {
  code: string
  name: string
  credits: number
  price_cents: number
}

export interface PurchaseView {
  id: string
  status: 'pending' | 'paid' | 'refunded' | 'canceled' | 'expired'
  credits: number
  price_cents: number
  invoice_url: string | null
  paid_at: Date | null
  created_at: Date
}

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

export async function listPackages(f: FastifyInstance): Promise<PublicPackage[]> {
  return f.db<PublicPackage[]>`
    SELECT code, name, credits, price_cents FROM credit_packages
    WHERE active ORDER BY sort_order, price_cents`
}

export async function hasCustomer(f: FastifyInstance, userId: string): Promise<boolean> {
  const rows = await f.db`SELECT 1 FROM payment_customers WHERE user_id = ${userId}`
  return rows.length > 0
}

/** Vencimento da cobrança avulsa: amanhã, em São Paulo (o Pix vale até lá). */
export function tomorrowSaoPaulo(now: Date): string {
  return saoPauloDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))
}

export async function checkoutPurchase(
  f: FastifyInstance,
  asaas: AsaasClient,
  userId: string,
  body: PurchaseCheckoutBody,
  now: Date = new Date(),
): Promise<{ purchase_id: string; status: 'pending'; invoice_url: string | null }> {
  const [pkg] = await f.db<(PublicPackage & { id: string })[]>`
    SELECT id, code, name, credits, price_cents FROM credit_packages
    WHERE code = ${body.package_code} AND active`
  if (!pkg) throw new AppError(404, 'PACKAGE_NOT_FOUND', 'Pacote não encontrado.')

  // Mesmo pacote pendente há menos de 24 h: devolve a mesma fatura, sem cobrança nova.
  const [pending] = await f.db<{ id: string; invoice_url: string | null }[]>`
    SELECT id, invoice_url FROM credit_purchases
    WHERE user_id = ${userId} AND package_id = ${pkg.id} AND status = 'pending'
      AND asaas_payment_id IS NOT NULL AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT 1`
  if (pending)
    return { purchase_id: pending.id, status: 'pending', invoice_url: pending.invoice_url }

  let [customer] = await f.db<{ asaas_customer_id: string }[]>`
    SELECT asaas_customer_id FROM payment_customers WHERE user_id = ${userId}`
  if (!customer) {
    if (!body.cpf_cnpj || !body.name)
      throw new AppError(422, 'DOCUMENT_REQUIRED', 'Informe seu nome e CPF para a primeira compra.')
    const document = normalizeCpfCnpj(body.cpf_cnpj)
    const created = await asaas.createCustomer({
      name: body.name,
      cpfCnpj: document,
      externalReference: userId,
    })
    await f.db`
      INSERT INTO payment_customers(user_id, asaas_customer_id) VALUES(${userId}, ${created.id})
      ON CONFLICT (user_id) DO NOTHING`
    ;[customer] = await f.db<{ asaas_customer_id: string }[]>`
      SELECT asaas_customer_id FROM payment_customers WHERE user_id = ${userId}`
  }

  // Linha local antes do Asaas: o índice único barra o toque duplo.
  let local: { id: string }
  try {
    ;[local] = await f.db<{ id: string }[]>`
      INSERT INTO credit_purchases(user_id, package_id, credits, price_cents)
      VALUES(${userId}, ${pkg.id}, ${pkg.credits}, ${pkg.price_cents})
      RETURNING id`
  } catch (err) {
    if (pgCode(err) === '23505')
      throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'Sua compra já está sendo criada.')
    throw err
  }

  let payment: { id: string; invoiceUrl?: string }
  try {
    payment = await asaas.createPayment({
      customer: customer.asaas_customer_id,
      billingType: 'UNDEFINED',
      value: pkg.price_cents / 100,
      dueDate: tomorrowSaoPaulo(now),
      description: `CalorIA — ${pkg.credits} créditos`,
      externalReference: local.id,
      ...(env.ASAAS_SUCCESS_URL ? { callback: { successUrl: env.ASAAS_SUCCESS_URL } } : {}),
    })
  } catch (err) {
    await f.db`DELETE FROM credit_purchases WHERE id = ${local.id} AND asaas_payment_id IS NULL`
    throw err
  }
  await f.db`
    UPDATE credit_purchases SET asaas_payment_id = ${payment.id},
      invoice_url = ${payment.invoiceUrl ?? null}, updated_at = now()
    WHERE id = ${local.id}`
  f.log.info({ credit_purchase: { id: local.id, package: pkg.code } }, 'credit_purchase_checkout')
  return { purchase_id: local.id, status: 'pending', invoice_url: payment.invoiceUrl ?? null }
}

export async function getPurchase(
  f: FastifyInstance,
  userId: string,
  id: string,
): Promise<PurchaseView> {
  const [row] = await f.db<PurchaseView[]>`
    SELECT id, status, credits, price_cents, invoice_url, paid_at, created_at
    FROM credit_purchases WHERE id = ${id} AND user_id = ${userId}`
  if (!row) throw new AppError(404, 'PURCHASE_NOT_FOUND', 'Compra não encontrada.')
  return { ...row, invoice_url: row.status === 'pending' ? row.invoice_url : null }
}

// ---- Admin ----

function mapPackageError(err: unknown): never {
  if (pgCode(err) === '23505')
    throw new AppError(409, 'PACKAGE_CODE_TAKEN', 'Já existe um pacote com esse código.')
  if (pgCode(err) === '23514') throw new AppError(422, 'INVALID_PACKAGE', 'Pacote inválido.')
  throw err
}

export async function listAllPackages(f: FastifyInstance) {
  return f.db`SELECT * FROM credit_packages ORDER BY active DESC, sort_order, price_cents`
}

export async function createPackage(f: FastifyInstance, body: CreatePackageBody) {
  try {
    const [row] = await f.db`
      INSERT INTO credit_packages(code, name, credits, price_cents, active, sort_order)
      VALUES(${body.code}, ${body.name}, ${body.credits}, ${body.price_cents}, ${body.active}, ${body.sort_order})
      RETURNING *`
    f.log.info(
      { package_created: { code: body.code, price_cents: body.price_cents } },
      'package_created',
    )
    return row
  } catch (err) {
    mapPackageError(err)
  }
}

/** Vale para novas compras: a compra guarda a cópia de créditos e preço. */
export async function updatePackage(f: FastifyInstance, id: string, body: UpdatePackageBody) {
  try {
    const [row] = await f.db`
      UPDATE credit_packages SET
        name = COALESCE(${body.name ?? null}, name),
        credits = COALESCE(${body.credits ?? null}::int, credits),
        price_cents = COALESCE(${body.price_cents ?? null}::int, price_cents),
        active = COALESCE(${body.active ?? null}::boolean, active),
        sort_order = COALESCE(${body.sort_order ?? null}::int, sort_order),
        updated_at = now()
      WHERE id = ${id}
      RETURNING *`
    if (!row) throw new AppError(404, 'PACKAGE_NOT_FOUND', 'Pacote não encontrado.')
    f.log.info({ package_updated: { id, fields: Object.keys(body) } }, 'package_updated')
    return row
  } catch (err) {
    if (err instanceof AppError) throw err
    mapPackageError(err)
  }
}
