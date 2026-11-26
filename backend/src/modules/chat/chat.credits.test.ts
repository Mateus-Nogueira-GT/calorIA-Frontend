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
    const params = transaction.calls.find((c) => c.sql.includes('INSERT INTO chat_history'))?.params
    const persisted = JSON.parse(
      String(params?.find((p) => typeof p === 'string' && p.startsWith('['))),
    ) as { role: string; content: string; at?: string }[]
    // Cada mensagem leva o horário (`at`, 04/11); o resto é igual.
    expect(persisted.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'Olá!' },
    ])
    expect(persisted.every((m) => typeof m.at === 'string')).toBe(true)
    expect(result.credit_receipt).toEqual(receipt)
  })

  it('settlement appends only the new turn to the stored history (R8, 25/11)', async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = true
    const stored = [
      { role: 'user', content: 'antiga' },
      { role: 'assistant', content: 'resposta antiga' },
    ]
    const source = fakeFastify([['SELECT messages, updated_at', [{ messages: stored }]]], {
      chatCreate: async () => textCompletion('Olá!'),
    })
    const transaction = fakeFastify([['INSERT INTO chat_history', [{ id: CONV }]]])
    vi.mocked(runCreditOperation).mockImplementation(async (_fastify, _input, infer, persist) => {
      const result = await infer()
      await persist?.(transaction.fastify.db, result)
      return { result, receipt }
    })
    await sendChatMessage(source.fastify, USER, { message: 'oi', conversation_id: CONV }, KEY)
    const insert = transaction.calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
    expect(insert?.sql).toContain('|| EXCLUDED.messages')
    const turn = JSON.parse(
      String(insert?.params.find((p) => typeof p === 'string' && p.startsWith('['))),
    ) as { content: string }[]
    expect(turn.map((m) => m.content)).toEqual(['oi', 'Olá!'])
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

  describe('geração de dieta só persiste na liquidação (R4/R5, 25/11)', () => {
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
      message_to_user: 'Vou montar!',
      health_conditions: [],
    }
    const wrote = (calls: { sql: string }[], sql: string) => calls.some((c) => c.sql.includes(sql))

    it('liquidação que expira não deixa job, perfil nem histórico gravados', async () => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      const source = fakeFastify([], { chatCreate: async () => toolCompletion(dados) })
      vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer) => {
        await infer()
        throw new AppError(409, 'OPERATION_EXPIRED', 'Esta tentativa expirou sem cobrança.')
      })
      await expect(
        sendChatMessage(source.fastify, USER, { message: 'sim', conversation_id: CONV }, KEY),
      ).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' })
      expect(wrote(source.calls, 'INSERT INTO diet_jobs')).toBe(false)
      expect(wrote(source.calls, 'INSERT INTO diets')).toBe(false)
      expect(wrote(source.calls, 'UPDATE profiles')).toBe(false)
      expect(wrote(source.calls, 'INSERT INTO chat_history')).toBe(false)
    })

    it('na liquidação grava job, perfil e histórico (generating) com o job da resposta', async () => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      const source = fakeFastify([], { chatCreate: async () => toolCompletion(dados) })
      const transaction = fakeFastify([['INSERT INTO chat_history', [{ id: CONV }]]])
      vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer, persist) => {
        const result = await infer()
        await persist?.(transaction.fastify.db, result)
        return { result, receipt }
      })
      const out = await sendChatMessage(
        source.fastify,
        USER,
        { message: 'sim', conversation_id: CONV },
        KEY,
      )
      expect(out.diet_job_id).toEqual(expect.any(String))
      for (const sql of ['INSERT INTO diet_jobs', 'INSERT INTO diets', 'UPDATE profiles'])
        expect(wrote(source.calls, sql)).toBe(false)
      const job = transaction.calls.find((c) => c.sql.includes('INSERT INTO diet_jobs'))
      expect(job?.params[0]).toBe(out.diet_job_id)
      expect(wrote(transaction.calls, 'INSERT INTO diets')).toBe(true)
      expect(wrote(transaction.calls, 'UPDATE profiles')).toBe(true)
      const history = transaction.calls.find((c) => c.sql.includes('INSERT INTO chat_history'))
      expect(history?.params).toContain('generating')
      // diets.conversation_id referencia chat_history: a conversa nova nasce antes.
      const at = (sql: string) => transaction.calls.findIndex((c) => c.sql.includes(sql))
      expect(at('INSERT INTO chat_history')).toBeLessThan(at('INSERT INTO diets'))
    })

    it('job em andamento descoberto na liquidação recusa sem gravar o turno', async () => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      const source = fakeFastify([], { chatCreate: async () => toolCompletion(dados) })
      const transaction = fakeFastify([
        ["status IN ('pending', 'running')", [{ id: 'outro-job' }]],
        ['INSERT INTO chat_history', [{ id: CONV }]],
      ])
      vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer, persist) => {
        const result = await infer()
        await persist?.(transaction.fastify.db, result)
        return { result, receipt }
      })
      await expect(
        sendChatMessage(source.fastify, USER, { message: 'sim', conversation_id: CONV }, KEY),
      ).rejects.toBeInstanceOf(AppError)
      // O turno gravado antes na mesma transação é desfeito pelo rollback.
      expect(wrote(transaction.calls, 'INSERT INTO diet_jobs')).toBe(false)
    })

    it('geração já em andamento é reaproveitada, sem job novo na liquidação', async () => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      const source = fakeFastify(
        [["status IN ('pending', 'running')", [{ id: 'job-em-voo', diet_id: 'dieta-em-voo' }]]],
        { chatCreate: async () => toolCompletion(dados) },
      )
      const transaction = fakeFastify([['INSERT INTO chat_history', [{ id: CONV }]]])
      vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer, persist) => {
        const result = await infer()
        await persist?.(transaction.fastify.db, result)
        return { result, receipt }
      })
      const out = await sendChatMessage(
        source.fastify,
        USER,
        { message: 'sim', conversation_id: CONV },
        KEY,
      )
      expect(out.diet_job_id).toBe('job-em-voo')
      expect(wrote(transaction.calls, 'INSERT INTO diet_jobs')).toBe(false)
      expect(wrote(transaction.calls, 'INSERT INTO chat_history')).toBe(true)
    })

    it('recusa de segurança e dado inválido também só gravam na liquidação', async () => {
      env.CREDITS_ENFORCEMENT_ENABLED = true
      for (const args of [
        { ...dados, health_conditions: ['gestante'] },
        { ...dados, height_cm: 1.75 },
      ]) {
        const source = fakeFastify([], { chatCreate: async () => toolCompletion(args) })
        vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer) => {
          await infer()
          throw new AppError(409, 'OPERATION_EXPIRED', 'Esta tentativa expirou sem cobrança.')
        })
        await expect(
          sendChatMessage(source.fastify, USER, { message: 'sim', conversation_id: CONV }, KEY),
        ).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' })
        expect(wrote(source.calls, 'INSERT INTO chat_history')).toBe(false)
      }
    })

    it.each([true, false])(
      'argumento truncado de collect_diet_data vira erro de IA (cobrança=%s)',
      async (enforced) => {
        env.CREDITS_ENFORCEMENT_ENABLED = enforced
        const bad = toolCompletion({})
        bad.choices[0].message.tool_calls[0].function.arguments = '{"weight_kg": 70, "height'
        const source = fakeFastify([], { chatCreate: async () => bad })
        vi.mocked(runCreditOperation).mockImplementation(async (_f, _i, infer) => ({
          result: await infer(),
          receipt: null,
        }))
        const out = await sendChatMessage(
          source.fastify,
          USER,
          { message: 'sim', conversation_id: CONV },
          KEY,
        ).catch((e: unknown) => e)
        expect(out).toBeInstanceOf(AppError)
        expect(out).toMatchObject({ code: 'AI_TRUNCATED' })
        expect(wrote(source.calls, 'INSERT INTO chat_history')).toBe(false)
      },
    )
  })
})
