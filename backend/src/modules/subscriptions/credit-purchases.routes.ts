import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { JwtPayload } from '../../shared/types.js'
import {
  checkoutPurchase,
  getPurchase,
  hasCustomer,
  listPackages,
  purchaseCheckoutBodySchema,
} from './credit-purchases.service.js'
import { asaasFromEnv, assertCreditPurchasesEnabled } from './subscriptions.config.js'

/** Prefixo /credit-purchases. 404 com CREDIT_PURCHASES_ENABLED=false. */
const routes: FastifyPluginAsyncZod = async (f) => {
  f.addHook('onRequest', async () => assertCreditPurchasesEnabled())
  f.addHook('preHandler', async (req) => {
    await req.jwtVerify()
  })
  f.get('/packages', async () => ({ packages: await listPackages(f) }))
  f.get('/customer', async (req) => ({
    has_customer: await hasCustomer(f, (req.user as JwtPayload).sub),
  }))
  f.post(
    '/checkout',
    {
      schema: { body: purchaseCheckoutBodySchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    (req) => checkoutPurchase(f, asaasFromEnv(f), (req.user as JwtPayload).sub, req.body),
  )
  f.get('/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, (req) =>
    getPurchase(f, (req.user as JwtPayload).sub, req.params.id),
  )
}

export default routes
