import type { FastifyInstance } from 'fastify'
import { checkDailyQuota, logAiUsage } from '../../shared/ai-usage.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { TranscribeBody, TranscribeMimeType } from './chat.schemas.js'

/**
 * Transcrição de áudio do coach (Whisper via OpenRouter).
 *
 * Usamos fetch direto (não o SDK OpenAI): o endpoint do OpenRouter recebe JSON
 * com `input_audio` em base64, não multipart como o da OpenAI.
 */

const DEFAULT_TRANSCRIBE_MODEL = 'openai/whisper-1'
/** O OpenRouter corta o processamento em 60 s; abortamos um pouco antes. */
const TRANSCRIBE_TIMEOUT_MS = 55_000

/**
 * Estimativa de tokens por segundo de áudio para a quota diária (OP2). O
 * OpenRouter costuma devolver só `usage.seconds` no Whisper (sem tokens), e
 * sem estimativa o áudio nunca contaria no AI_DAILY_TOKEN_CAP. 25 tok/s ≈ o
 * custo de uma mensagem de chat curta a cada ~10 s de fala: 60 s = 1.500
 * tokens, então o teto padrão (200k) comporta ~130 min de áudio/dia.
 */
export const TRANSCRIBE_TOKENS_PER_SECOND = 25
/** Sem tokens nem seconds na resposta: cobra como um áudio de 60 s (o máximo do app). */
export const TRANSCRIBE_FALLBACK_TOKENS = 60 * TRANSCRIBE_TOKENS_PER_SECOND

type AudioFormat = 'm4a' | 'aac' | 'webm'

export function audioFormatFromMime(mimeType: TranscribeMimeType): AudioFormat {
  switch (mimeType) {
    case 'audio/aac':
      return 'aac'
    case 'audio/webm':
      return 'webm'
    default:
      // audio/m4a e audio/mp4 (container MP4/AAC que o iOS/Android gravam)
      return 'm4a'
  }
}

interface OpenRouterTranscription {
  text?: unknown
  usage?: {
    seconds?: number
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
    cost?: number
  } | null
}

/** Tokens a registrar: os do provedor quando vierem (> 0); senão estimativa por segundos ou fixa. */
function usageForQuota(usage: OpenRouterTranscription['usage']) {
  const total = usage?.total_tokens
  if (typeof total === 'number' && total > 0) {
    return {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: total,
    }
  }
  const seconds = usage?.seconds
  const estimate =
    typeof seconds === 'number' && seconds > 0
      ? Math.ceil(seconds * TRANSCRIBE_TOKENS_PER_SECOND)
      : TRANSCRIBE_FALLBACK_TOKENS
  return { prompt_tokens: estimate, completion_tokens: 0, total_tokens: estimate }
}

const failed = () =>
  new AppError(502, 'TRANSCRIBE_FAILED', 'Não foi possível transcrever o áudio. Tente novamente.')

export async function transcribeAudio(
  fastify: FastifyInstance,
  userId: string,
  body: TranscribeBody,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string }> {
  await checkDailyQuota(fastify, userId)

  const model = env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL

  let res: Response
  try {
    res = await fetchImpl(`${env.OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://caloria.app',
        'X-Title': 'CalorIA',
      },
      body: JSON.stringify({
        model,
        input_audio: { data: body.audio, format: audioFormatFromMime(body.mimeType) },
        language: 'pt',
      }),
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    })
  } catch (err) {
    // Rede, DNS, timeout (TimeoutError do AbortSignal).
    fastify.log.error({ err }, 'Falha de rede/timeout na transcrição')
    throw failed()
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    fastify.log.error(
      { status: res.status, detail: detail.slice(0, 500), model },
      'Provedor de transcrição respondeu erro',
    )
    // 4xx do provedor (modelo indisponível, sem crédito, chave inválida...) não
    // se resolve tentando de novo: serviço indisponível. 5xx, 408 (timeout) e
    // 429 (rate limit upstream) são transitórios: falha que vale repetir.
    const transient = res.status === 408 || res.status === 429
    if (res.status >= 400 && res.status < 500 && !transient) {
      throw new AppError(
        503,
        'TRANSCRIBE_UNAVAILABLE',
        'A transcrição de áudio está indisponível no momento. Digite sua mensagem.',
      )
    }
    throw failed()
  }

  let data: OpenRouterTranscription
  try {
    data = (await res.json()) as OpenRouterTranscription
  } catch (err) {
    fastify.log.error({ err }, 'Resposta de transcrição não é JSON')
    throw failed()
  }

  // A chamada foi feita (e cobrada): registra o uso mesmo se o texto vier vazio.
  logAiUsage(fastify, {
    feature: 'transcribe',
    model,
    userId,
    usage: usageForQuota(data.usage),
  })

  if (typeof data.text !== 'string') {
    fastify.log.error({ data }, 'Resposta de transcrição sem campo text')
    throw failed()
  }

  const text = data.text.trim()
  if (!text) {
    throw new AppError(
      422,
      'EMPTY_TRANSCRIPTION',
      'Não conseguimos entender o áudio. Tente falar de novo, mais perto do microfone.',
    )
  }
  return { text }
}
