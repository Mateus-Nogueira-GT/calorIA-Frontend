import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../shared/env.js'
import { type AsaasEvent, handleAsaasEvent, webhookTokenMatches } from './asaas-webhook.service.js'
import { assertSubscriptionsEnabled } from './subscriptions.config.js'

const eventSchema = z
  .object({
    id: z.string().min(1).max(100),
    event: z.string().min(1).max(80),
    payment: z
      .object({
        id: z.string().min(1).max(64),
        subscription: z.string().max(64).nullish(),
        status: z.string().max(60).optional(),
        value: z.number().optional(),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        invoiceUrl: z.string().max(500).optional(),
      })
      .passthrough()
      .optional(),
    subscription: z
      .object({ id: z.string().min(1).max(64) })
      .passthrough()
      .optional(),
  })
  .passthrough()

/**
 * POST /webhooks/asaas — sem JWT; autenticado pelo header asaas-access-token.
 * 200 depois de gravar (inclusive duplicata e evento que não nos interessa:
 * a fila do Asaas pausa após 15 falhas seguidas). 500 só em falha real, para
 * o Asaas reenviar.
 */
const routes: FastifyPluginAsyncZod = async (f) => {
  f.addHook('onRequest', async () => assertSubscriptionsEnabled())
  f.post('/', { schema: { body: eventSchema } }, async (req, reply) => {
    if (!env.ASAAS_WEBHOOK_TOKEN) {
      f.log.error('asaas_webhook_token_missing')
      return reply
        .status(503)
        .send({ error: 'PAYMENTS_UNAVAILABLE', message: 'Webhook não configurado.' })
    }
    if (!webhookTokenMatches(req.headers['asaas-access-token'], env.ASAAS_WEBHOOK_TOKEN)) {
      f.log.warn({ ip: req.ip }, 'asaas_webhook_bad_token')
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Não autorizado' })
    }
    const ev = req.body as AsaasEvent
    try {
      const outcome = await handleAsaasEvent(f, ev)
      f.log.info({ asaas_webhook: { id: ev.id, event: ev.event, outcome } }, 'asaas_webhook')
      return { received: true }
    } catch (err) {
      f.log.error({ err, id: ev.id, event: ev.event }, 'asaas_webhook_failed')
      return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'Tente novamente.' })
    }
  })
}

export default routes
