import type { FastifyInstance } from 'fastify'
import { checkDailyQuota, logAiUsage } from '../../shared/ai-usage.js'
import { assertAiTariffConfigured } from '../../shared/credit-ai-policy.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { getChatHistory } from './chat.service.js'

/**
 * Resposta falada do Coach (TTS via OpenRouter /audio/speech, compatível com a
 * API de fala da OpenAI). Fala só a ÚLTIMA resposta do Coach gravada no
 * histórico da conversa do próprio usuário — o app não envia texto livre.
 */
export const SPEECH_MAX_CHARS = 4000
const SPEECH_TIMEOUT_MS = 30_000
/** Estimativa para a cota diária: o provedor cobra por caractere/token de texto. */
const CHARS_PER_TOKEN = 4

/** PCM do provedor: 16 bits, mono. Taxa vem do Content-Type (`rate=`) ou do env. */
const PCM_BITS = 16
const PCM_CHANNELS = 1

export type SpeechMimeType = 'audio/mpeg' | 'audio/wav'

/** Envolve PCM 16 bits mono num container WAV, que o iOS e o Android tocam nativamente. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = (sampleRate * PCM_CHANNELS * PCM_BITS) / 8
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(PCM_CHANNELS, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE((PCM_CHANNELS * PCM_BITS) / 8, 32)
  header.writeUInt16LE(PCM_BITS, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function pcmRate(contentType: string | null): number {
  const match = contentType?.match(/rate=(\d+)/i)
  const rate = match ? Number(match[1]) : env.OPENAI_TTS_PCM_RATE
  return Number.isFinite(rate) && rate > 0 ? rate : env.OPENAI_TTS_PCM_RATE
}

const unavailable = () =>
  new AppError(503, 'SPEECH_UNAVAILABLE', 'A resposta em áudio está indisponível no momento.')
const failed = () =>
  new AppError(502, 'SPEECH_FAILED', 'Não foi possível gerar a resposta em áudio.')

/** Texto falável: sem marcação de markdown e com no máximo SPEECH_MAX_CHARS. */
export function speechText(raw: string): string {
  const plain = raw
    .replace(/`+/g, '')
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .trim()
  if (plain.length <= SPEECH_MAX_CHARS) return plain
  const cut = plain.slice(0, SPEECH_MAX_CHARS)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return end > SPEECH_MAX_CHARS / 2 ? cut.slice(0, end + 1) : cut.trimEnd()
}

export async function synthesizeLastReply(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ audio: string; mimeType: SpeechMimeType }> {
  if (!env.COACH_SPEECH_ENABLED) throw unavailable()
  assertAiTariffConfigured('speech_synthesis')

  const { messages } = await getChatHistory(fastify, userId, conversationId)
  const reply = [...messages].reverse().find((m) => m.role === 'assistant')
  const input = reply ? speechText(reply.content) : ''
  if (!input) throw new AppError(404, 'NO_REPLY_TO_SPEAK', 'Ainda não há resposta para ouvir.')

  await checkDailyQuota(fastify, userId)

  const model = env.OPENAI_TTS_MODEL
  // Gemini TTS só devolve PCM bruto; o servidor converte para WAV.
  const format = env.OPENAI_TTS_FORMAT
  let res: Response
  try {
    res = await fetchImpl(`${env.OPENAI_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://caloria.app',
        'X-Title': 'CalorIA',
      },
      body: JSON.stringify({ model, voice: env.OPENAI_TTS_VOICE, input, response_format: format }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    })
  } catch (err) {
    fastify.log.error({ err }, 'Falha de rede/timeout na síntese de voz')
    throw failed()
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    fastify.log.error(
      { status: res.status, detail: detail.slice(0, 500), model },
      'Provedor de voz respondeu erro',
    )
    const transient = res.status === 408 || res.status === 429
    if (res.status >= 400 && res.status < 500 && !transient) throw unavailable()
    throw failed()
  }

  let bytes: ArrayBuffer
  try {
    bytes = await res.arrayBuffer()
  } catch (err) {
    fastify.log.error({ err }, 'Falha ao ler o áudio do provedor')
    throw failed()
  }
  if (bytes.byteLength === 0) throw failed()

  const tokens = Math.ceil(input.length / CHARS_PER_TOKEN)
  logAiUsage(fastify, {
    feature: 'speech',
    model,
    userId,
    conversationId,
    usage: { prompt_tokens: tokens, completion_tokens: 0, total_tokens: tokens },
  })

  if (format === 'mp3')
    return { audio: Buffer.from(bytes).toString('base64'), mimeType: 'audio/mpeg' }
  const wav = pcmToWav(Buffer.from(bytes), pcmRate(res.headers.get('content-type')))
  return { audio: wav.toString('base64'), mimeType: 'audio/wav' }
}
