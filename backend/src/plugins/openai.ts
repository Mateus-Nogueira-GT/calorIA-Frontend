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
  // Cliente lazy: não testamos a conexão no boot. Em serverless isso só adiciona
  // latência de cold start e arriscaria atrasar/derrubar a função por causa de
  // chave/limite. A validação acontece no 1º uso real, com erro tratado no serviço.
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })

  fastify.decorate('openai', openai)
})

export default openaiPlugin
