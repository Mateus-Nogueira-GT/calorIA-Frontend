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
    // Com Fluid Compute a MESMA instância atende várias requisições concorrentes;
    // max:1 (padrão serverless clássico) virava fila de 9-12s sob concorrência 10
    // (medido em teste de carga). Pool pequeno por instância + pooler do Supabase
    // (porta 6543) + prepare:false — prepared statements não sobrevivem ao pgbouncer.
    max: 8,
    idle_timeout: 20, // fechar conexões idle após 20s
    connect_timeout: 10, // timeout de conexão em segundos
    prepare: false,
    transform: {
      // Converte snake_case do DB para camelCase no JS automaticamente
      // Deixamos off para manter snake_case e ser explícito
      undefined: undefined,
    },
    onnotice: (msg) => fastify.log.debug({ msg }, 'db notice'),
  })

  // Ping de boot NÃO-fatal: um servidor não deve cair por causa de um ping.
  // Se houver problema real de conexão, a 1ª query o revela com erro tratado.
  try {
    await sql`SELECT 1`
    fastify.log.info('✅  Banco de dados conectado')
  } catch (err) {
    fastify.log.warn(err, '⚠️  Ping inicial ao banco falhou — seguindo (1ª query revelará o erro)')
  }

  fastify.decorate('db', sql)

  fastify.addHook('onClose', async () => {
    await sql.end({ timeout: 5 })
    fastify.log.info('Banco de dados desconectado')
  })
})

export default dbPlugin
