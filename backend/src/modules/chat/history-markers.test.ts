import { describe, expect, it } from 'vitest'
import { fakeFastify } from '../../shared/testing/fake-fastify.js'
import { DIET_COMPLETED_MARKER as JOBS_COMPLETED_MARKER } from '../diets/jobs.service.js'
import { formatDietStartedMarker, getChatHistory } from './chat.service.js'
import { DIET_COMPLETED_MARKER, isInternalChatMarker } from './history-markers.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

describe('isInternalChatMarker', () => {
  it('reconhece o marcador de início e o de conclusão', () => {
    expect(isInternalChatMarker(formatDietStartedMarker(new Date()))).toBe(true)
    expect(isInternalChatMarker(DIET_COMPLETED_MARKER)).toBe(true)
    expect(isInternalChatMarker(`  ${DIET_COMPLETED_MARKER}\n`)).toBe(true)
  })

  it('o job grava o mesmo marcador que o chat reconhece', () => {
    expect(JOBS_COMPLETED_MARKER).toBe(DIET_COMPLETED_MARKER)
  })

  it('texto comum do coach não é marcador', () => {
    expect(isInternalChatMarker('Dieta concluída! Bom apetite.')).toBe(false)
    expect(isInternalChatMarker('[Dica] beba água')).toBe(false)
  })
})

describe('getChatHistory (feedback 27/10: marcadores vazavam para a conversa)', () => {
  it('não devolve os marcadores internos', async () => {
    const messages = [
      { role: 'user', content: 'muda para 6 refeições' },
      { role: 'assistant', content: 'Vou montar sua dieta com 6 refeições.' },
      { role: 'assistant', content: formatDietStartedMarker(new Date()) },
      { role: 'assistant', content: DIET_COMPLETED_MARKER },
      { role: 'user', content: 'valeu' },
    ]
    const { fastify } = fakeFastify([['FROM chat_history', [{ messages, status: 'completed' }]]])
    const r = await getChatHistory(fastify, USER, CONV)
    expect(r.messages.map((m) => m.content)).toEqual([
      'muda para 6 refeições',
      'Vou montar sua dieta com 6 refeições.',
      'valeu',
    ])
    expect(r.status).toBe('completed')
  })
})
