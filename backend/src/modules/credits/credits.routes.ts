import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { JwtPayload } from '../../shared/types.js'
import { CREDIT_POLICY } from './credit-policy.js'
import { registerCreditErrors } from './credits.errors.js'
import { cancelCreditOperation, reconcileCreditOperations, wallet } from './credits.service.js'
const routes: FastifyPluginAsyncZod = async (f) => {
  registerCreditErrors(f)
  f.addHook('preHandler', async (req) => {
    await req.jwtVerify()
  })
  f.get('/me', async (req) => {
    const user = (req.user as JwtPayload).sub
    if (env.CREDITS_ENFORCEMENT_ENABLED) await reconcileCreditOperations(f, user)
    return {
      ...(await wallet(f, user)),
      units_per_credit: 5,
      enforcement_enabled: env.CREDITS_ENFORCEMENT_ENABLED,
      invites_enabled: env.CREDIT_INVITES_ENABLED,
      policy: CREDIT_POLICY,
    }
  })
  f.get(
    '/ledger',
    { schema: { querystring: z.object({ cursor: z.string().uuid().optional() }) } },
    async (req) => {
      if (!env.CREDITS_ENFORCEMENT_ENABLED && !env.CREDIT_INVITES_ENABLED)
        return { items: [], next_cursor: null }
      const user = (req.user as JwtPayload).sub
      const cursor = req.query.cursor
      const items =
        await f.db`SELECT id,units,kind,operation_id,created_at FROM credit_ledger WHERE user_id=${user} AND (${cursor ?? null}::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM credit_ledger WHERE id=${cursor ?? null} AND user_id=${user})) ORDER BY created_at DESC,id DESC LIMIT 51`
      return { items: items.slice(0, 50), next_cursor: items.length > 50 ? items[49].id : null }
    },
  )
  const operation = async (user: string, id: string, byKey: boolean) => {
    if (!env.CREDITS_ENFORCEMENT_ENABLED)
      throw new AppError(404, 'NOT_FOUND', 'Tentativa não encontrada')
    await reconcileCreditOperations(f, user)
    const [row] =
      await f.db`SELECT id,type,state,cost_units,result,receipt,created_at FROM credit_operations WHERE user_id=${user} AND ${byKey ? f.db`idempotency_key=${id}` : f.db`id=${id}::uuid`}`
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Tentativa não encontrada')
    return row
  }
  f.get(
    '/operations/by-key/:key',
    { schema: { params: z.object({ key: z.string().min(16).max(128) }) } },
    (req) => operation((req.user as JwtPayload).sub, req.params.key, true),
  )
  f.post(
    '/operations/by-key/:key/cancel',
    { schema: { params: z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) }) } },
    (req) => cancelCreditOperation(f, (req.user as JwtPayload).sub, req.params.key),
  )
  f.get('/operations/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, (req) =>
    operation((req.user as JwtPayload).sub, req.params.id, false),
  )
}
export default routes
