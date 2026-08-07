import type { FastifyInstance } from 'fastify'
import type { JwtPayload } from './types.js'

/**
 * Autorização de admin (Workstream M).
 *
 * A fonte da verdade é SEMPRE a coluna profiles.is_admin, consultada a cada
 * request — nunca um claim do JWT nem estado do cliente. Assim, revogar o
 * privilégio tem efeito imediato e forjar o token não concede acesso.
 *
 * Fail-closed: qualquer erro na consulta nega o acesso.
 */
export async function isAdminUser(fastify: FastifyInstance, userId: string): Promise<boolean> {
  try {
    const [row] = await fastify.db<{ is_admin: boolean }[]>`
      SELECT is_admin FROM profiles WHERE id = ${userId}
    `
    return row?.is_admin === true
  } catch (err) {
    fastify.log.warn(err, 'Falha ao verificar is_admin — negando acesso')
    return false
  }
}

/**
 * Registra o preHandler de admin no escopo do plugin. Deve vir DEPOIS do hook
 * de jwtVerify (ordem de registro importa no Fastify).
 *
 * Responde 404 em vez de 403 de propósito: não revelamos que a rota existe
 * para quem não pode usá-la.
 */
export function registerAdminGuard(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (request, reply) => {
    const { sub: userId } = request.user as JwtPayload
    if (!(await isAdminUser(fastify, userId))) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recurso não encontrado' })
    }
  })
}
