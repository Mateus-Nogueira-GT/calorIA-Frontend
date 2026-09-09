import { describe, expect, it } from 'vitest'
import { fakeFastify, toolCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'

const dados = {
  weight_kg: 70,
  height_cm: 175,
  age: 30,
  gender: 'female',
  goal: 'lose_weight',
  activity_level: 'moderate',
  meals_per_day: 4,
  dietary_restrictions: [],
  allergies: [],
  food_preferences: null,
  message_to_user: 'Vou montar sua dieta!',
  health_conditions: [],
}

describe('handleDietGeneration — guardrails de coleta (S3/S4)', () => {
  it('gestante: não cria job, responde com a recusa e persiste como collecting', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, health_conditions: ['gestante'] }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toContain('gestante')
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('UPDATE profiles'))).toBe(false)
    const persist = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    expect(persist?.params).toContain('collecting')
  })

  it('IMC baixo + perder peso: recusa o déficit e oferece manutenção, sem job', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, weight_kg: 45, height_cm: 165 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toMatch(/MANUTENÇÃO/)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('UPDATE profiles'))).toBe(false)
    const persist = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    expect(persist?.params).toContain('collecting')
  })

  it('altura em metros: pergunta específica citando o valor', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, height_cm: 1.75 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).toBeNull()
    expect(r.message.content).toContain('1.75')
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(false)
    expect(calls.some((c) => c.sql.includes('UPDATE profiles'))).toBe(false)
    const persist = calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    expect(persist?.params).toContain('collecting')
  })

  it('IMC > 40: cria o job e anexa o aviso à mensagem', async () => {
    const { fastify, calls } = fakeFastify([], {
      chatCreate: async () => toolCompletion({ ...dados, weight_kg: 120, height_cm: 160 }),
    })

    const r = await sendChatMessage(fastify, USER, { message: 'sim', conversation_id: CONV })

    expect(r.diet_job_id).not.toBeNull()
    expect(r.message.content).toContain('Vou montar sua dieta!')
    expect(r.message.content).toMatch(/acompanhamento médico/)
    expect(calls.some((c) => c.sql.includes('INSERT INTO diet_jobs'))).toBe(true)
  })
})
