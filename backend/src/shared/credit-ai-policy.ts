import { env } from './env.js'
import { AppError } from './errors.js'

export type AiFeature =
  | 'diet_generation'
  | 'audio_transcription'
  | 'guest_scanner'
  | 'speech_synthesis'

/**
 * Tarifa de cada recurso de IA fora de foto/mensagem quando a carteira está
 * ligada. 'free' = decisão de produto (21/10/2026): não debita créditos.
 * Um recurso novo precisa entrar aqui; sem tarifa definida ele falha fechado,
 * para nunca virar gratuito por omissão.
 */
export const AI_FEATURE_TARIFFS: Readonly<Partial<Record<AiFeature, 'free'>>> = Object.freeze({
  diet_generation: 'free',
  audio_transcription: 'free',
  guest_scanner: 'free',
  speech_synthesis: 'free',
})

export function assertAiTariffConfigured(feature: AiFeature): void {
  if (env.CREDITS_ENFORCEMENT_ENABLED && !AI_FEATURE_TARIFFS[feature]) {
    throw new AppError(
      503,
      'CREDIT_POLICY_UNAVAILABLE',
      'Este recurso aguarda a definição da política de créditos. Tente novamente mais tarde.',
    )
  }
}
