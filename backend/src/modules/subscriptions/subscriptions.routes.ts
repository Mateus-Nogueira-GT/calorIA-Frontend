import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { JwtPayload } from '../../shared/types.js'
import { listActivePlans } from './plans.service.js'
import { asaasFromEnv, assertSubscriptionsEnabled } from './subscriptions.config.js'
import { checkoutBodySchema } from './subscriptions.schemas.js'
import { cancelMySubscription, checkout, getMySubscription } from './subscriptions.service.js'

/** Prefixo /subscriptions. Tudo responde 404 com SUBSCRIPTIONS_ENABLED=false. */
const routes: FastifyPluginAsyncZod = async (f) => {
  f.addHook('onRequest', async () => assertSubscriptionsEnabled())

  // Público: o site mostra os preços antes do login.
  f.get('/plans', async () => ({ plans: await listActivePlans(f) }))

  const authRoutes: FastifyPluginAsyncZod = async (auth) => {
    auth.addHook('preHandler', async (req) => {
      await req.jwtVerify()
    })
    auth.get('/me', (req) => getMySubscription(f, (req.user as JwtPayload).sub))
    auth.post(
      '/checkout',
      {
        schema: { body: checkoutBodySchema },
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      },
      (req) => checkout(f, asaasFromEnv(f), (req.user as JwtPayload).sub, req.body),
    )
    auth.post('/cancel', (req) =>
      cancelMySubscription(f, asaasFromEnv(f), (req.user as JwtPayload).sub),
    )
  }
  await f.register(authRoutes)
}

export default routes
