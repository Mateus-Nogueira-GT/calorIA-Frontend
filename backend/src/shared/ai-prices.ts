/**
 * Preços por token (US$) para o custo ESTIMADO no painel admin. Fonte: lista
 * pública do OpenRouter em 21/10/2026 (GET /api/v1/models). A fatura do
 * OpenRouter é a fonte oficial; atualizar aqui quando o modelo ou o preço mudar.
 *
 * - Whisper é cobrado por minuto (US$ 0,006); o app grava ~25 tokens por segundo
 *   de áudio (TRANSCRIBE_TOKENS_PER_SECOND), então 0,006 / 60 / 25 por token.
 * - Gemini TTS: só os tokens de texto são registrados (os de áudio gerado não
 *   vêm na resposta), então o custo da voz fica subestimado.
 */
export const AI_PRICES_AS_OF = '2026-10-21'

const PRICES: Readonly<Record<string, { prompt: number; completion: number }>> = Object.freeze({
  'openai/gpt-6.1-sol': { prompt: 0.000002, completion: 0.00001 },
  'google/gemini-3.8-flash-tts': { prompt: 0.0000005, completion: 0.000009 },
  'openai/whisper-1': { prompt: 0.006 / 60 / 25, completion: 0 },
})

/** Custo estimado; null quando o modelo não está na tabela. */
export function estimateUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const price = PRICES[model]
  if (!price) return null
  return promptTokens * price.prompt + completionTokens * price.completion
}
