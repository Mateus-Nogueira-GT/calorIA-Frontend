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
  //
  // Apontado para o OpenRouter (API compatível com a OpenAI). HTTP-Referer e
  // X-Title são os headers de atribuição recomendados pelo OpenRouter.
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': 'https://caloria.app',
      'X-Title': 'CalorIA',
    },
  })

  fastify.decorate('openai', openai)
})

export default openaiPlugin
