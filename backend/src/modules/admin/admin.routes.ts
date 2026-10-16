import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError } from '../../shared/errors.js'
import { registerAdminGuard } from '../../shared/require-admin.js'
import type { JwtPayload } from '../../shared/types.js'
import { assertInvitesEnabled, createInvite } from '../credit-invites/credit-invites.service.js'
import { registerCreditErrors } from '../credits/credits.errors.js'
const routes: FastifyPluginAsyncZod = async (f) => {
  registerCreditErrors(f)
  f.addHook('preHandler', async (req) => {
    await req.jwtVerify()
  })
  registerAdminGuard(f)
  f.addHook('preHandler', async () => assertInvitesEnabled())
  f.get(
    '/credit-invites',
    { schema: { querystring: z.object({ cursor: z.string().uuid().optional() }) } },
    async (req) => {
      const c = req.query.cursor
      const items =
        await f.db`SELECT id,label,CASE WHEN status='active' AND expires_at<=now() THEN 'expired' ELSE status END AS status,grant_units,expires_at,created_at,claimed_by FROM credit_invites WHERE (${c ?? null}::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM credit_invites WHERE id=${c ?? null})) ORDER BY created_at DESC,id DESC LIMIT 51`
      return { items: items.slice(0, 50), next_cursor: items.length > 50 ? items[49].id : null }
    },
  )
  f.post(
    '/credit-invites',
    { schema: { body: z.object({ label: z.string().trim().max(100).optional() }) } },
    (req) =>
      createInvite(
        f,
        (req.user as JwtPayload).sub,
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : undefined,
        req.body.label,
      ),
  )
  f.post(
    '/credit-invites/:id/revoke',
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (req) => {
      const [row] =
        await f.db`UPDATE credit_invites SET status='revoked' WHERE id=${req.params.id} AND status='active' RETURNING id,label,status,grant_units,expires_at,created_at,claimed_by`
      if (!row)
        throw new AppError(409, 'INVITE_UNAVAILABLE', 'Convite não está disponível para revogação.')
      return row
    },
  )
}
export default routes
