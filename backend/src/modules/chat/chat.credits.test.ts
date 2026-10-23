import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { fakeFastify, textCompletion, toolCompletion } from '../../shared/testing/fake-fastify.js'
import { runCreditOperation } from '../credits/credits.service.js'
import { createDietJob, processJobStep } from '../diets/jobs.service.js'
import { analyzePhoto } from '../scanner/scanner.service.js'
import { sendChatMessage } from './chat.service.js'
import { transcribeAudio } from './transcribe.service.js'

vi.mock('../credits/credits.service.js', () => ({ runCreditOperation: vi.fn() }))
const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const KEY = 'credit-turn-attempt-001'
const receipt = { operation_id: CONV, charged_units: 2, balance_units: 58, available_units: 58 }
const originalFlag = env.CREDITS_ENFORCEMENT_ENABLED

afterEach(() => {
  env.CREDITS_ENFORCEMENT_ENABLED = originalFlag
  vi.resetAllMocks()
})

describe('AI wallet integration boundary', () => {
  it('reserves two message units before inference; writes history only through settlement transaction', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    const source = fakeFastify([], { chatCreate: async () => textCompletion('Olá!') })
    const transaction = fakeFastify([['INSERT INTO chat_history', [{ id: CONV }]]])
    vi.mocked(runCreditOperation).mockImplementation(async (_fastify, input, infer, persist) => {
      expect(input).toMatchObject({
        userId: USER,
        key: KEY,
        type: 'chat',
        costUnits: 2,
        conversationId: CONV,
      })
      expect(source.openaiCalls).toHaveLength(0)
      const result = await infer()
      expect(source.calls.some((c) => c.sql.includes('INSERT INTO chat_history'))).toBe(false)
      await persist?.(transaction.fastify.db, result)
      return { result, receipt }
    })
    const result = await sendChatMessage(
      source.fastify,
      USER,
      { message: 'oi', conversation_id: CONV },
      KEY,
    )
    expect(source.openaiCalls).toHaveLength(1)
    // Geração de dieta liberada sem custo (21/10): a tool continua disponível.
    expect(source.openaiCalls[0].params.tools).toBeDefined()
    const system = (source.openaiCalls[0].params.messages as { content: string }[])[0].content
    expect(system).not.toContain('temporariamente indisponível')
    expect(
      transaction.calls.find((c) => c.sql.includes('INSERT INTO chat_history'))?.params,
    ).toContain(
      JSON.stringify([
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'Olá!' },
      ]),
    )
    expect(result.credit_receipt).toEqual(receipt)
  })

  it('reservation rejection never calls the provider or persists a message', async () => {
    const source = fakeFastify()
    vi.mocked(runCreditOperation).mockRejectedValue(
      new AppError(402, 'INSUFFICIENT_CREDITS', 'Saldo insuficiente.'),
    )
    await expect(
      sendChatMessage(source.fastify, USER, { message: 'oi', conversation_id: CONV }, KEY),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' })
    expect(source.openaiCalls).toHaveLength(0)
    expect(source.calls).toHaveLength(0)
  })

  it('recovered operation returns saved response without a provider call', async () => {
    const source = fakeFastify()
    const saved = {
      conversation_id: CONV,
      message: {
        role: 'assistant' as const,
        content: 'Resposta salva',
        created_at: '2026-10-15T00:00:00Z',
      },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
    vi.mocked(runCreditOperation).mockResolvedValue({ result: saved, receipt })
    expect(
      await sendChatMessage(source.fastify, USER, { message: 'oi', conversation_id: CONV }, KEY),
    ).toEqual({ ...saved, credit_receipt: receipt })
    expect(source.openaiCalls).toHaveLength(0)
  })

  it('diet tool inside a paid message is no longer blocked by tariff policy', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    const source = fakeFastify([], { chatCreate: async () => toolCompletion({}) })
    vi.mocked(runCreditOperation).mockImplementation(async (_fastify, _input, infer) => ({
      result: await infer(),
      receipt,
    }))
    const outcome = await sendChatMessage(
      source.fastify,
      USER,
      { message: 'gera dieta', conversation_id: CONV },
      KEY,
    ).catch((e: unknown) => e)
    expect(outcome).not.toMatchObject({ code: 'CREDIT_POLICY_UNAVAILABLE' })
  })

  it('scanner reserves fifteen units before inference and returns receipt', async () => {
    const fake = fakeFastify([], {
      parse: async () => ({
        choices: [
          {
            message: {
              parsed: {
                is_food: true,
                items: [
                  {
                    weightGrams: 100,
                    name: 'Arroz',
                    calories: 100,
                    protein: 2,
                    carbs: 20,
                    fat: 1,
                    fiber: 1,
                    confidence: 0.9,
                  },
                ],
              },
            },
          },
        ],
      }),
    })
    vi.mocked(runCreditOperation).mockImplementation(async (_fastify, input, infer) => {
      expect(input).toMatchObject({ type: 'photo', costUnits: 15, key: KEY })
      expect(fake.openaiCalls).toHaveLength(0)
      return { result: await infer(), receipt: { ...receipt, charged_units: 15 } }
    })
    const result = await analyzePhoto(fake.fastify, 'data:image/jpeg;base64,AAAA', USER, KEY)
    expect(result.credit_receipt?.charged_units).toBe(15)
    expect(fake.openaiCalls).toHaveLength(1)
  })

  it('guest scanner, transcription and diet generation are free under enforcement', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    const fake = fakeFastify()
    for (const run of [
      () => analyzePhoto(fake.fastify, 'data:image/jpeg;base64,AAAA', null),
      () => transcribeAudio(fake.fastify, USER, { audio: 'AAAA', mimeType: 'audio/m4a' }),
      () => processJobStep(fake.fastify, USER, CONV),
    ]) {
      const outcome = await run().catch((e: unknown) => e)
      expect(outcome).not.toMatchObject({ code: 'CREDIT_POLICY_UNAVAILABLE' })
    }
  })
})
