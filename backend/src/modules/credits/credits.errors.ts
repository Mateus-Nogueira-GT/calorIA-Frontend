import type { FastifyError, FastifyInstance } from 'fastify'
import { AppError } from '../../shared/errors.js'
/** Credit endpoints must distinguish unavailable accounting from a real zero balance. */
export function registerCreditErrors(f: FastifyInstance) {
  f.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      })
    if (error.validation)
      return reply
        .status(400)
        .send({ error: 'VALIDATION_ERROR', message: 'Dados inválidos na requisição' })
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
      return reply.status(error.statusCode).send({
        error: error.statusCode === 401 ? 'UNAUTHORIZED' : error.code,
        message: error.message,
      })
    f.log.error({ err: error, url: request.url }, 'Credit accounting unavailable')
    return reply.status(503).send({
      error: 'CREDITS_UNAVAILABLE',
      message: 'Não foi possível consultar os créditos. Tente novamente.',
    })
  })
}
