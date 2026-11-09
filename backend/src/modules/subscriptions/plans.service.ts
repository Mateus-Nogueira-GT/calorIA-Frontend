import type { FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
import type {
  AdminPlan,
  CreatePlanBody,
  PublicPlan,
  UpdatePlanBody,
} from './subscriptions.schemas.js'

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

function mapPlanError(err: unknown): never {
  if (pgCode(err) === '23505')
    throw new AppError(409, 'PLAN_CODE_TAKEN', 'Já existe um plano com esse código.')
  if (pgCode(err) === '23514')
    throw new AppError(
      422,
      'INVALID_PLAN',
      'O plano precisa dar créditos por ciclo, uso ilimitado ou os dois.',
    )
  throw err
}

export async function listActivePlans(f: FastifyInstance): Promise<PublicPlan[]> {
  return f.db<PublicPlan[]>`
    SELECT code,name,description,price_cents,cycle,credits_per_cycle,unlimited
    FROM subscription_plans WHERE active ORDER BY sort_order, price_cents`
}

export async function listAllPlans(f: FastifyInstance): Promise<AdminPlan[]> {
  return f.db<
    AdminPlan[]
  >`SELECT * FROM subscription_plans ORDER BY active DESC, sort_order, price_cents`
}

export async function createPlan(f: FastifyInstance, body: CreatePlanBody): Promise<AdminPlan> {
  try {
    const [row] = await f.db<AdminPlan[]>`
      INSERT INTO subscription_plans(code,name,description,price_cents,cycle,credits_per_cycle,unlimited,active,sort_order)
      VALUES(${body.code},${body.name},${body.description ?? null},${body.price_cents},${body.cycle},
        ${body.credits_per_cycle ?? null},${body.unlimited},${body.active},${body.sort_order})
      RETURNING *`
    f.log.info({ plan_created: { code: body.code, price_cents: body.price_cents } }, 'plan_created')
    return row
  } catch (err) {
    mapPlanError(err)
  }
}

/**
 * Mudança vale para novas assinaturas: quem já assinou guarda a cópia do
 * preço/benefício. Campo ausente no corpo fica como está; `null` explícito
 * limpa descrição ou créditos (a CHECK do banco garante o benefício).
 */
export async function updatePlan(
  f: FastifyInstance,
  id: string,
  body: UpdatePlanBody,
): Promise<AdminPlan> {
  const has = (k: keyof UpdatePlanBody) => Object.hasOwn(body, k)
  try {
    const [row] = await f.db<AdminPlan[]>`
      UPDATE subscription_plans SET
        name = COALESCE(${body.name ?? null}, name),
        description = CASE WHEN ${has('description')} THEN ${body.description ?? null} ELSE description END,
        price_cents = COALESCE(${body.price_cents ?? null}::int, price_cents),
        cycle = COALESCE(${body.cycle ?? null}, cycle),
        credits_per_cycle = CASE WHEN ${has('credits_per_cycle')} THEN ${body.credits_per_cycle ?? null}::int ELSE credits_per_cycle END,
        unlimited = COALESCE(${body.unlimited ?? null}::boolean, unlimited),
        active = COALESCE(${body.active ?? null}::boolean, active),
        sort_order = COALESCE(${body.sort_order ?? null}::int, sort_order),
        updated_at = now()
      WHERE id = ${id}
      RETURNING *`
    if (!row) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado.')
    f.log.info({ plan_updated: { id, fields: Object.keys(body) } }, 'plan_updated')
    return row
  } catch (err) {
    if (err instanceof AppError) throw err
    mapPlanError(err)
  }
}
