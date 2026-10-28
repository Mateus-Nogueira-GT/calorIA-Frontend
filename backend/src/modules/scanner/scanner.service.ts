import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { z } from 'zod'
import { buildModelsField, checkDailyQuota, logAiUsage } from '../../shared/ai-usage.js'
import { assertAiTariffConfigured } from '../../shared/credit-ai-policy.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { VISION_MAX_KCAL, sanitizeVisionResult } from '../../shared/guardrails/index.js'
import { runCreditOperation } from '../credits/credits.service.js'
import {
  type ScanResponse,
  scanItemSchema,
  visionAnalysisSchema,
  visionItemSchema,
} from './scanner.schemas.js'

import { SCANNER_ANALYSIS_VERSION, VISION_SYSTEM_PROMPT } from './scanner.prompt.js'

const cacheSchema = z.discriminatedUnion('notFood', [
  z.object({ version: z.literal(2), notFood: z.literal(true) }),
  z.object({
    version: z.literal(2),
    notFood: z.literal(false),
    items: z
      .array(
        scanItemSchema
          .omit({ id: true })
          .extend({ weightGrams: visionItemSchema.shape.weightGrams }),
      )
      .min(1)
      .max(20),
  }),
])
type CacheResult = z.infer<typeof cacheSchema>

async function readCache(fastify: FastifyInstance, hash: string): Promise<CacheResult | null> {
  try {
    const [row] = await fastify.db<{ result: CacheResult }[]>`
      SELECT result FROM scan_cache
      WHERE image_hash = ${hash} AND created_at > NOW() - interval '24 hours'
    `
    const cached = cacheSchema.safeParse(row?.result)
    return cached.success ? cached.data : null
  } catch (err) {
    fastify.log.warn(err, 'Falha ao ler scan_cache — seguindo sem cache')
    return null
  }
}

function writeCache(fastify: FastifyInstance, hash: string, result: CacheResult): void {
  // try/catch em volta da tagged template: postgres.js devolve uma promise
  // rejeitada em falhas normais, mas nada garante que a chamada em si nunca
  // lance de forma síncrona. Sem isso, essa classe de erro escaparia daqui e
  // derrubaria analyzePhoto por causa de uma escrita de cache best-effort.
  try {
    void fastify.db`
      INSERT INTO scan_cache (image_hash, result)
      VALUES (${hash}, ${JSON.stringify(result)}::jsonb)
      ON CONFLICT (image_hash) DO UPDATE SET result = EXCLUDED.result, created_at = NOW()
    `.catch((err: unknown) => {
      try {
        fastify.log.warn(err, 'Falha ao gravar scan_cache (best-effort)')
      } catch {
        // nada mais a fazer sem derrubar a request
      }
    })
  } catch (err) {
    try {
      fastify.log.warn(err, 'Falha ao gravar scan_cache (best-effort)')
    } catch {
      // nada mais a fazer sem derrubar a request
    }
  }
}

/**
 * Analisa a foto de um prato via OpenAI Vision e retorna a estimativa nutricional.
 * Recebe a imagem como data URL base64 (data:image/...;base64,...).
 * userId null = convidado sem conta: cai no teto global de convidados.
 */
export async function analyzePhoto(
  fastify: FastifyInstance,
  imageDataUrl: string,
  userId: string | null,
  idempotencyKey?: string,
): Promise<ScanResponse> {
  if (userId === null) {
    assertAiTariffConfigured('guest_scanner')
    return analyzePhotoCore(fastify, imageDataUrl, userId)
  }
  const { result, receipt } = await runCreditOperation(
    fastify,
    { userId, key: idempotencyKey, payload: { image: imageDataUrl }, type: 'photo', costUnits: 15 },
    () => analyzePhotoCore(fastify, imageDataUrl, userId),
  )
  return receipt ? { ...result, credit_receipt: receipt } : result
}

async function analyzePhotoCore(
  fastify: FastifyInstance,
  imageDataUrl: string,
  userId: string | null,
): Promise<ScanResponse> {
  await checkDailyQuota(fastify, userId, 'vision')

  // OP3: a mesma foto reenviada não paga uma chamada nova.
  const hash = createHash('sha256')
    .update(`${SCANNER_ANALYSIS_VERSION}:${imageDataUrl}`)
    .digest('hex')
  const cached = await readCache(fastify, hash)
  if (cached) {
    if (cached.notFood)
      throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
    return { items: cached.items.map((item) => ({ id: randomUUID(), ...item })) }
  }

  let analysis: import('./scanner.schemas.js').VisionAnalysis
  try {
    const completion = await fastify.openai.beta.chat.completions.parse({
      model: env.OPENAI_VISION_MODEL,
      // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
      ...buildModelsField(env.OPENAI_VISION_MODEL, env.OPENAI_FALLBACK_MODELS),
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta refeição e estime os valores nutricionais.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        },
      ],
      response_format: zodResponseFormat(visionAnalysisSchema, 'food_analysis'),
      // GPT-5 (reasoning + visão): sem temperature custom e com teto folgado pra
      // os reasoning tokens não estourarem antes do JSON da análise.
      max_tokens: 4000,
      // Reasoning baixo: análise de foto não precisa raciocínio profundo e reduz latência.
      reasoning_effort: 'low',
    })

    logAiUsage(fastify, {
      feature: 'vision',
      model: env.OPENAI_VISION_MODEL,
      userId,
      usage: completion.usage,
      finishReason: completion.choices[0]?.finish_reason ?? null,
    })
    const parsed = completion.choices[0].message.parsed
    if (!parsed) throw new Error('OpenAI retornou análise vazia')
    analysis = visionAnalysisSchema.parse(parsed)
    if (analysis.is_food && analysis.items.length === 0) throw new Error('Análise sem alimentos')
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao analisar foto via Vision')
    throw new AppError(502, 'VISION_ERROR', 'Não foi possível analisar a imagem. Tente novamente.')
  }

  if (!analysis.is_food) {
    writeCache(fastify, hash, { version: 2, notFood: true })
    throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
  }

  const items = analysis.items.map((item) => ({
    name: item.name,
    weightGrams: item.weightGrams,
    // Uma panela pode exceder o teto de uma porção sem ser uma saída absurda.
    ...sanitizeVisionResult(item, Math.max(VISION_MAX_KCAL, item.weightGrams * 9)),
  }))
  writeCache(fastify, hash, { version: 2, notFood: false, items })
  return { items: items.map((item) => ({ id: randomUUID(), ...item })) }
}
