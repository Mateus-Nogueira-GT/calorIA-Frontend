import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { buildModelsField, checkDailyQuota, logAiUsage } from '../../shared/ai-usage.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { sanitizeVisionResult } from '../../shared/guardrails/index.js'
import { type ScanItem, type ScanResponse, visionAnalysisSchema } from './scanner.schemas.js'

const VISION_SYSTEM_PROMPT = `Você é um nutricionista especialista em análise visual de alimentos.
Receberá a foto de um prato/refeição e deve estimar os valores nutricionais do que está visível.

## REGRAS
- Identifique o prato com um nome curto em português (ex: "Arroz, feijão e frango grelhado").
- Estime os totais da PORÇÃO INTEIRA visível na foto (não por 100g).
- calories em kcal; protein, carbs e fat em gramas. Use números inteiros ou com 1 casa decimal.
- confidence é a sua confiança na estimativa, entre 0 e 1 (ex: 0.82).
- Se a imagem NÃO contiver comida (pessoa, paisagem, objeto, etc.), retorne is_food=false
  e zere os demais valores.
- Baseie-se em alimentos brasileiros comuns quando houver ambiguidade.`

type CachedItem = Omit<ScanItem, 'id'>
type CacheResult = { notFood: true } | { notFood: false; item: CachedItem }

async function readCache(fastify: FastifyInstance, hash: string): Promise<CacheResult | null> {
  try {
    const [row] = await fastify.db<{ result: CacheResult }[]>`
      SELECT result FROM scan_cache
      WHERE image_hash = ${hash} AND created_at > NOW() - interval '24 hours'
    `
    return row?.result ?? null
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
 */
export async function analyzePhoto(
  fastify: FastifyInstance,
  imageDataUrl: string,
  userId: string,
): Promise<ScanResponse> {
  await checkDailyQuota(fastify, userId)

  // OP3: a mesma foto reenviada não paga uma chamada nova.
  const hash = createHash('sha256').update(imageDataUrl).digest('hex')
  const cached = await readCache(fastify, hash)
  if (cached) {
    if (cached.notFood)
      throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
    return { items: [{ id: randomUUID(), ...cached.item }] }
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
    })
    const parsed = completion.choices[0].message.parsed
    if (!parsed) throw new Error('OpenAI retornou análise vazia')
    analysis = parsed
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao analisar foto via Vision')
    throw new AppError(502, 'VISION_ERROR', 'Não foi possível analisar a imagem. Tente novamente.')
  }

  if (!analysis.is_food) {
    writeCache(fastify, hash, { notFood: true })
    throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
  }

  const item: CachedItem = { name: analysis.name, ...sanitizeVisionResult(analysis) }
  writeCache(fastify, hash, { notFood: false, item })
  return { items: [{ id: randomUUID(), ...item }] }
}
