import type { FastifyInstance } from 'fastify'
import { env } from './env.js'
import { AppError } from './errors.js'

/**
 * Telemetria e resiliência das chamadas de IA (Workstream I5).
 * Sem tabela: emitimos uma linha de log estruturada por chamada, dá pra saber
 * hoje quanto custa cada dieta/usuário sem migration nova.
 */

export type AiFeature = 'chat' | 'diet_day' | 'vision'

interface AiUsageParams {
  feature: AiFeature
  model: string
  userId: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
}

/**
 * Registra o uso de tokens de uma completion: log estruturado + linha em
 * ai_usage (o log sozinho não é consultável por SQL, então o painel admin
 * não conseguia mostrar custo).
 *
 * NUNCA lança e NUNCA bloqueia: a gravação é disparada sem await e qualquer
 * falha vira warn. Uma indisponibilidade da tabela não pode derrubar a
 * geração de uma dieta nem uma mensagem do coach.
 */
export function logAiUsage(fastify: FastifyInstance, params: AiUsageParams): void {
  try {
    fastify.log.info(
      {
        ai_usage: {
          feature: params.feature,
          model: params.model,
          userId: params.userId,
          promptTokens: params.usage?.prompt_tokens ?? null,
          completionTokens: params.usage?.completion_tokens ?? null,
          totalTokens: params.usage?.total_tokens ?? null,
        },
      },
      'ai_usage',
    )

    void fastify.db`
      INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (
        ${params.userId}, ${params.feature}, ${params.model},
        ${params.usage?.prompt_tokens ?? null},
        ${params.usage?.completion_tokens ?? null},
        ${params.usage?.total_tokens ?? null}
      )
    `.catch((err: unknown) => {
      // Envolvemos log.warn em try/catch porque um erro ao serializar `err` ou
      // ao escrever o warn pode gerar uma promise rejeitada. Como esta função
      // roda sem await (void), qualquer rejeição pendente vira unhandled rejection,
      // que pode derrubar o processo Node. O try/catch interno captura tudo.
      try {
        fastify.log.warn(err, 'Falha ao persistir ai_usage (telemetria best-effort)')
      } catch {
        // Telemetria de telemetria também falhou; impossível fazer mais nada
        // sem derrubar a request. Silenciamos.
      }
    })
  } catch {
    // Telemetria nunca deve derrubar a request.
  }
}

/**
 * OP2: teto diário por usuário. Rate limits por minuto existiam; por dia, não —
 * e ai_usage era gravada e nunca lida. Fail-open: se a tabela estiver fora,
 * libera com warn; telemetria não pode bloquear o produto.
 */
export async function checkDailyQuota(fastify: FastifyInstance, userId: string): Promise<void> {
  let used = 0
  try {
    const [row] = await fastify.db<{ used: number }[]>`
      SELECT COALESCE(SUM(total_tokens), 0)::INT AS used
      FROM ai_usage
      WHERE user_id = ${userId} AND created_at >= NOW() - interval '24 hours'
    `
    used = row?.used ?? 0
  } catch (err) {
    fastify.log.warn(err, 'Falha ao consultar quota diária de IA — liberando (fail-open)')
    return
  }
  if (used >= env.AI_DAILY_TOKEN_CAP) {
    fastify.log.warn({ userId, used, cap: env.AI_DAILY_TOKEN_CAP }, 'Quota diária de IA excedida')
    throw new AppError(
      429,
      'AI_QUOTA_EXCEEDED',
      'Você atingiu o limite diário de uso da IA. Tente novamente amanhã.',
    )
  }
}

/** CSV de modelos de fallback → lista limpa (trim, sem vazios). */
export function parseFallbackModels(csv: string | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
}

/**
 * Constrói o campo `models` do OpenRouter (modelo primário + fallbacks) para
 * mesclar no body da chamada. Vazio quando não há fallbacks → o SDK usa só
 * `model` como hoje. O parâmetro `models` é específico do OpenRouter e não faz
 * parte do tipo do SDK OpenAI, por isso o caller faz o cast na hora de mesclar.
 */
export function buildModelsField(
  primaryModel: string,
  fallbackCsv: string | undefined,
): { models: string[] } | Record<string, never> {
  const fallbacks = parseFallbackModels(fallbackCsv)
  if (fallbacks.length === 0) return {}
  return { models: [primaryModel, ...fallbacks] }
}
