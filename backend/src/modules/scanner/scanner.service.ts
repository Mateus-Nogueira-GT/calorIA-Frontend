import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { visionAnalysisSchema, type ScanResponse } from './scanner.schemas.js'

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

/**
 * Analisa a foto de um prato via OpenAI Vision e retorna a estimativa nutricional.
 * Recebe a imagem como data URL base64 (data:image/...;base64,...).
 */
export async function analyzePhoto(
  fastify: FastifyInstance,
  imageDataUrl: string,
): Promise<ScanResponse> {
  let analysis: import('./scanner.schemas.js').VisionAnalysis
  try {
    const completion = await fastify.openai.beta.chat.completions.parse({
      model: env.OPENAI_VISION_MODEL,
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
      max_tokens: 500,
      temperature: 0.2,
    })

    const parsed = completion.choices[0].message.parsed
    if (!parsed) throw new Error('OpenAI retornou análise vazia')
    analysis = parsed
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao analisar foto via Vision')
    throw new AppError(502, 'VISION_ERROR', 'Não foi possível analisar a imagem. Tente novamente.')
  }

  if (!analysis.is_food) {
    throw new AppError(422, 'NOT_FOOD', 'Não identificamos comida nesta imagem.')
  }

  return {
    items: [
      {
        id: randomUUID(),
        name: analysis.name,
        calories: Math.max(0, Math.round(analysis.calories)),
        protein: Math.max(0, Math.round(analysis.protein)),
        carbs: Math.max(0, Math.round(analysis.carbs)),
        fat: Math.max(0, Math.round(analysis.fat)),
        confidence: Math.min(1, Math.max(0, analysis.confidence)),
      },
    ],
  }
}
