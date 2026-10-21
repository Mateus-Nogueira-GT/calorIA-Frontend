import { afterEach, describe, expect, it } from 'vitest'
import { AI_FEATURE_TARIFFS, assertAiTariffConfigured } from './credit-ai-policy.js'
import { env } from './env.js'

const original = env.CREDITS_ENFORCEMENT_ENABLED
afterEach(() => {
  env.CREDITS_ENFORCEMENT_ENABLED = original
})

describe('tarifas de IA com a carteira ligada', () => {
  it.each(['diet_generation', 'audio_transcription', 'guest_scanner'] as const)(
    '%s está liberado sem custo',
    (feature) => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      expect(AI_FEATURE_TARIFFS[feature]).toBe('free')
      expect(() => assertAiTariffConfigured(feature)).not.toThrow()
    },
  )
  it('recurso sem tarifa definida continua falhando fechado', () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    expect(() => assertAiTariffConfigured('unpriced' as never)).toThrow(
      expect.objectContaining({ code: 'CREDIT_POLICY_UNAVAILABLE' }),
    )
  })
})
