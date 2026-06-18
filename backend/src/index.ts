import { buildApp } from './server.js'
import { env } from './shared/env.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.PORT, host: env.HOST })

    if (env.NODE_ENV !== 'production') {
      app.log.info(`📚  Documentação da API: http://localhost:${env.PORT}/docs`)
    }
  } catch (err) {
    app.log.error(err, 'Falha ao iniciar o servidor')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

start()
