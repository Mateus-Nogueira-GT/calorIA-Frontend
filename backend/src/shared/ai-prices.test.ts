import { describe, expect, it } from 'vitest'
import { estimateUsd } from './ai-prices.js'

describe('estimateUsd', () => {
  it('soma entrada e saída pelo preço do modelo', () => {
    expect(estimateUsd('openai/gpt-6.1-sol', 1_000_000, 100_000)).toBeCloseTo(3, 6)
  })
  it('whisper: um minuto de áudio (1.500 tokens estimados) custa US$ 0,006', () => {
    expect(estimateUsd('openai/whisper-1', 1500, 0)).toBeCloseTo(0.006, 9)
  })
  it('modelo sem preço conhecido devolve null', () => {
    expect(estimateUsd('acme/unknown', 10, 10)).toBeNull()
  })
})
