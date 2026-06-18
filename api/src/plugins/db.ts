import fp from 'fastify-plugin'
import postgres from 'postgres'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../shared/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof postgres>
  }
}

const dbPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const sql = postgres(env.DATABASE_URL, {
    max: 10, // máximo de conexões no pool
    idle_timeout: 20, // fechar conexões idle após 20s
    connect_timeout: 10, // timeout de conexão em segundos
    transform: {
      // Converte snake_case do DB para camelCase no JS automaticamente
      // Deixamos off para manter snake_case e ser explícito
      undefined: undefined,
    },
    onnotice: (msg) => fastify.log.debug({ msg }, 'db notice'),
  })

  // Testa a conexão na inicialização
  try {
    await sql`SELECT 1`
    fastify.log.info('✅  Banco de dados conectado')
  } catch (err) {
    fastify.log.error(err, '❌  Falha ao conectar ao banco de dados')
    throw err
  }

  fastify.decorate('db', sql)

  fastify.addHook('onClose', async () => {
    await sql.end({ timeout: 5 })
    fastify.log.info('Banco de dados desconectado')
  })
})

export default dbPlugin
