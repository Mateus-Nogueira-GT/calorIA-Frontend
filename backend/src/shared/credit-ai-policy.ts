import { env } from './env.js'
import { AppError } from './errors.js'

/** Unpriced features cannot silently become free when wallet enforcement is on. */
export function assertAiTariffConfigured(
  _feature: 'diet_generation' | 'audio_transcription' | 'guest_scanner',
): void {
  if (env.CREDITS_ENFORCEMENT_ENABLED) {
    throw new AppError(
      503,
      'CREDIT_POLICY_UNAVAILABLE',
      'Este recurso aguarda a definição da política de créditos. Tente novamente mais tarde.',
    )
  }
}
