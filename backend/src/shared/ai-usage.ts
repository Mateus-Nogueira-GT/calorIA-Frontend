import type { FastifyInstance } from 'fastify'
import { env } from './env.js'
import { AppError } from './errors.js'

/**
 * Telemetria e resiliência das chamadas de IA (Workstream I5).
 * Sem tabela: emitimos uma linha de log estruturada por chamada, dá pra saber
 * hoje quanto custa cada dieta/usuário sem migration nova.
 */

export type AiFeature = 'chat' | 'diet_day' | 'vision' | 'transcribe' | 'speech'

interface AiUsageParams {
  feature: AiFeature
  model: string
  /** null = scan de convidado (sem conta) — a coluna user_id aceita NULL. */
  userId: string | null
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  } | null
  // OP4: contexto para consultas de alerta (loop de tool, truncamentos).
  conversationId?: string | null
  jobId?: string | null
  finishReason?: string | null
  toolCalled?: boolean | null
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
          conversationId: params.conversationId ?? null,
          jobId: params.jobId ?? null,
          finishReason: params.finishReason ?? null,
          toolCalled: params.toolCalled ?? null,
        },
      },
      'ai_usage',
    )

    void fastify.db`
      INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens,
                            conversation_id, job_id, finish_reason, tool_called)
      VALUES (
        ${params.userId}, ${params.feature}, ${params.model},
        ${params.usage?.prompt_tokens ?? null},
        ${params.usage?.completion_tokens ?? null},
        ${params.usage?.total_tokens ?? null},
        ${params.conversationId ?? null}, ${params.jobId ?? null},
        ${params.finishReason ?? null}, ${params.toolCalled ?? null}
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
 *
 * userId null = convidado (scanner sem conta, Guideline 5.1.1(v) da App Store).
 * Convidados não têm identidade, então dividem UM teto global de visão: o rate
 * limit por IP é em memória por instância e não segura quem troca de IP.
 */
export async function checkDailyQuota(
  fastify: FastifyInstance,
  userId: string | null,
): Promise<void> {
  const cap = userId ? env.AI_DAILY_TOKEN_CAP : env.GUEST_VISION_DAILY_TOKEN_CAP
  let used = 0
  try {
    const [row] = userId
      ? await fastify.db<{ used: number }[]>`
          SELECT COALESCE(SUM(total_tokens), 0)::INT AS used
          FROM ai_usage
          WHERE user_id = ${userId} AND created_at >= NOW() - interval '24 hours'
        `
      : await fastify.db<{ used: number }[]>`
          SELECT COALESCE(SUM(total_tokens), 0)::INT AS used
          FROM ai_usage
          WHERE user_id IS NULL AND feature = 'vision'
            AND created_at >= NOW() - interval '24 hours'
        `
    used = row?.used ?? 0
  } catch (err) {
    fastify.log.warn(err, 'Falha ao consultar quota diária de IA — liberando (fail-open)')
    return
  }
  if (used >= cap) {
    fastify.log.warn({ userId, used, cap }, 'Quota diária de IA excedida')
    throw new AppError(
      429,
      'AI_QUOTA_EXCEEDED',
      userId
        ? 'Você atingiu o limite diário de uso da IA. Tente novamente amanhã.'
        : 'O limite de análises sem conta foi atingido hoje. Crie uma conta para continuar.',
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
