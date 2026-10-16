import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import { registerCreditErrors } from '../credits/credits.errors.js'
import { previewInvite, redeemInvite } from './credit-invites.service.js'
const tokenBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
const routes: FastifyPluginAsyncZod = async (f) => {
  registerCreditErrors(f)
  f.post(
    '/preview',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { body: tokenBody } },
    (req) => previewInvite(f, req.body.token),
  )
  f.post(
    '/redeem',
    {
      preHandler: async (req) => {
        await req.jwtVerify()
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: tokenBody },
    },
    (req) => redeemInvite(f, (req.user as JwtPayload).sub, req.body.token),
  )
}
export default routes
