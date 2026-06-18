import fp from 'fastify-plugin'
import OpenAI from 'openai'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../shared/env.js'

declare module 'fastify' {
  interface FastifyInstance {
    openai: OpenAI
  }
}

const openaiPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })

  // Testa a conexão listando modelos disponíveis (não bloqueia o boot se falhar)
  try {
    await openai.models.list()
    fastify.log.info('✅  OpenAI conectado (modelo: %s)', env.OPENAI_MODEL)
  } catch (err) {
    fastify.log.warn(err, '⚠️  Falha ao conectar à OpenAI — verifique OPENAI_API_KEY')
  }

  fastify.decorate('openai', openai)
})

export default openaiPlugin
