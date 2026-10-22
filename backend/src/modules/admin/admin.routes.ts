import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError } from '../../shared/errors.js'
import { registerAdminGuard } from '../../shared/require-admin.js'
import type { JwtPayload } from '../../shared/types.js'
import { assertInvitesEnabled, createInvite } from '../credit-invites/credit-invites.service.js'
import { registerCreditErrors } from '../credits/credits.errors.js'
import { listInvites } from './admin-invites.service.js'
import { getOverview } from './admin-overview.service.js'
import { listUsers } from './admin-users.service.js'
import {
  adminOverviewSchema,
  adminUsersResponseSchema,
  invitesQuerySchema,
  periodQuerySchema,
  usersQuerySchema,
} from './admin.schemas.js'
const routes: FastifyPluginAsyncZod = async (f) => {
  registerCreditErrors(f)
  f.addHook('preHandler', async (req) => {
    await req.jwtVerify()
  })
  registerAdminGuard(f)

  // Métricas (spec 21/10): só leitura e independentes da flag de convites.
  f.get(
    '/overview',
    { schema: { querystring: periodQuerySchema, response: { 200: adminOverviewSchema } } },
    (req) => getOverview(f, req.query.days),
  )
  f.get(
    '/users',
    { schema: { querystring: usersQuerySchema, response: { 200: adminUsersResponseSchema } } },
    (req) => listUsers(f, (req.user as JwtPayload).sub, req.query),
  )

  await f.register(invitesRoutes)
}

/** Convites: dependem de CREDIT_INVITES_ENABLED (escopo próprio, herda JWT e guard). */
const invitesRoutes: FastifyPluginAsyncZod = async (f) => {
  f.addHook('preHandler', async () => assertInvitesEnabled())
  f.get('/credit-invites', { schema: { querystring: invitesQuerySchema } }, (req) =>
    listInvites(f, req.query),
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
