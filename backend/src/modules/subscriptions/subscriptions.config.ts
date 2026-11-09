import type { FastifyInstance } from 'fastify'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { type AsaasClient, createAsaasClient } from './asaas.client.js'

/** Flag desligada: as rotas se comportam como inexistentes. */
export function assertSubscriptionsEnabled(): void {
  if (!env.SUBSCRIPTIONS_ENABLED) throw new AppError(404, 'NOT_FOUND', 'Recurso não encontrado')
}

const unavailable = () =>
  new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Pagamentos indisponíveis no momento.')

/** Cliente do Asaas a partir do ambiente. Flag ligada sem chave → 503. */
export function asaasFromEnv(f: FastifyInstance): AsaasClient {
  if (!env.ASAAS_API_KEY) throw unavailable()
  return createAsaasClient({ apiKey: env.ASAAS_API_KEY, env: env.ASAAS_ENV, log: f.log })
}
