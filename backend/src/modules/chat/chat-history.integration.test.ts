import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../shared/env.js'
import { textCompletion } from '../../shared/testing/fake-fastify.js'
import { appendDietCompletedMarker } from '../diets/jobs.service.js'
import { HISTORY_MAX_MESSAGES, getChatHistory, sendChatMessage } from './chat.service.js'
import { DIET_COMPLETED_MARKER } from './history-markers.js'

// Só o que não é histórico nem crédito fica de fora do banco real.
vi.mock('../../shared/ai-usage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/ai-usage.js')>()),
  checkDailyQuota: vi.fn(async () => undefined),
  logAiUsage: vi.fn(),
}))
vi.mock('./chat-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-context.js')>()),
  fetchUserContext: vi.fn(async () => ({
    profile: null,
    diet: null,
    today: null,
    freeMeals: [],
    streak: null,
    mealsPerDay: null,
    date: '2026-11-25',
  })),
}))
vi.mock('../diets/jobs.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../diets/jobs.service.js')>()),
  getPendingJob: vi.fn(async () => null),
}))

const url = process.env.TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
  throw new Error('Disposable localhost database required')
;(url ? describe : describe.skip)('chat history / real PostgreSQL (R8, 25/11)', () => {
  const db = postgres(url ?? 'postgres://localhost/unused', { max: 5 })
  const user = randomUUID()
  const conversation = randomUUID()
  const old = env.CREDITS_ENFORCEMENT_ENABLED
  let onModelCall: () => Promise<void> = async () => undefined
  let modelMessages: { role: string; content: string }[] = []
  const f = {
    db,
    log: { error: () => {}, warn: () => {}, info: () => {} },
    openai: {
      chat: {
        completions: {
          create: async (params: { messages: { role: string; content: string }[] }) => {
            modelMessages = params.messages
            await onModelCall()
            return textCompletion('Combinado!')
          },
        },
      },
    },
  } as unknown as FastifyInstance
  beforeAll(async () => {
    const [name] = await db`SELECT current_database() AS name`
    if (!String(name.name).includes('credits_test'))
      throw new Error('Database name must contain credits_test; harness recreates schemas')
    await db.unsafe(`DROP SCHEMA IF EXISTS credit_private CASCADE; DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE profiles(id uuid PRIMARY KEY,is_admin boolean DEFAULT false,full_name text,coach_personality text);
 GRANT USAGE ON SCHEMA public TO anon,authenticated; GRANT ALL ON profiles TO anon,authenticated;
 CREATE TABLE chat_history(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),messages jsonb NOT NULL DEFAULT '[]',status text NOT NULL DEFAULT 'collecting',diet_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`)
    for (const migration of [
      '20261016012212_credits_and_invites.sql',
      '20261021204335_credits_deletion_key_fix.sql',
      '20261023120000_credit_grants_unlimited.sql',
    ])
      await db.unsafe(
        await readFile(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
          'utf8',
        ),
      )
    env.CREDITS_ENFORCEMENT_ENABLED = true
  })
  beforeEach(async () => {
    onModelCall = async () => undefined
    await db`TRUNCATE chat_history,credit_cancellations,credit_conversation_leases,credit_ledger,credit_operations,credit_wallets,profiles,auth.users CASCADE`
    await db`INSERT INTO auth.users(id) VALUES(${user})`
    await db`INSERT INTO profiles(id) VALUES(${user})`
    await db`INSERT INTO credit_wallets(user_id,balance_units) VALUES(${user},75)`
  })
  afterAll(async () => {
    env.CREDITS_ENFORCEMENT_ENABLED = old
    await db.end()
  })
  const stored = async () =>
    (
      await db<{ type: string; messages: string }[]>`
        SELECT jsonb_typeof(messages) AS type, messages::text AS messages
        FROM chat_history WHERE id=${conversation}`
    )[0]
  const contents = async () => {
    const row = await stored()
    expect(row.type).toBe('array')
    const messages = JSON.parse(row.messages) as { role: string; content: string }[]
    expect(messages.every((m) => typeof m === 'object' && typeof m.role === 'string')).toBe(true)
    return messages.map((m) => m.content)
  }
  const send = (message: string) =>
    sendChatMessage(f, user, { message, conversation_id: conversation }, randomUUID())
  const before = [
    { role: 'user', content: 'quero uma dieta' },
    { role: 'assistant', content: 'Vou montar!' },
  ]

  // `${texto}::jsonb` é como o código antigo gravava (string jsonb); `::text::jsonb`, array.
  it.each(['legado (string jsonb)', 'array'])(
    'marcador de dieta concluída gravado durante a resposta do modelo sobrevive à liquidação (%s)',
    async (shape) => {
      const seed = JSON.stringify(before)
      if (shape === 'array')
        await db`INSERT INTO chat_history(id,user_id,messages,status) VALUES(${conversation},${user},${seed}::text::jsonb,'generating')`
      else
        await db`INSERT INTO chat_history(id,user_id,messages,status) VALUES(${conversation},${user},${seed}::jsonb,'generating')`
      // O finalizeJob anexa o marcador enquanto o chat espera a IA.
      onModelCall = () => appendDietCompletedMarker(db, conversation, randomUUID())
      const out = await send('obrigado')
      expect(out.credit_receipt?.charged_units).toBe(2)
      expect(await contents()).toEqual([
        'quero uma dieta',
        'Vou montar!',
        DIET_COMPLETED_MARKER,
        'obrigado',
        'Combinado!',
      ])
    },
  )

  it('primeira mensagem cria a conversa e o teto de mensagens continua valendo', async () => {
    await send('oi')
    expect(await contents()).toEqual(['oi', 'Combinado!'])
    const many = Array.from({ length: HISTORY_MAX_MESSAGES }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `m${i}`,
    }))
    await db`UPDATE chat_history SET messages=${JSON.stringify(many)}::text::jsonb WHERE id=${conversation}`
    await send('mais uma')
    const capped = await contents()
    expect(capped).toHaveLength(HISTORY_MAX_MESSAGES)
    expect(capped[0]).toBe('m2')
    expect(capped.slice(-2)).toEqual(['mais uma', 'Combinado!'])
  })

  it('histórico já corrompido pelo marcador antigo (array de strings) não quebra o envio', async () => {
    const legacy = JSON.stringify([JSON.stringify(before), JSON.stringify([{ role: 'assistant' }])])
    await db`INSERT INTO chat_history(id,user_id,messages,status) VALUES(${conversation},${user},${legacy}::text::jsonb,'completed')`
    await expect(send('oi')).resolves.toMatchObject({ message: { content: 'Combinado!' } })
    // R7 (lote 8): a gravação repara a linha inteira, não só anexa o turno.
    expect(await contents()).toEqual(['quero uma dieta', 'Vou montar!', 'oi', 'Combinado!'])
  })

  describe('R7: histórico com mensagens serializadas dentro do array', () => {
    const three = [
      { role: 'user', content: 'quero uma dieta', at: '2026-11-01T10:00:00.000Z' },
      { role: 'assistant', content: 'Vou montar!' },
      { role: 'user', content: 'obrigado' },
    ]
    const marker = { role: 'system', content: DIET_COMPLETED_MARKER }
    // Forma real das linhas antigas: o histórico em string jsonb concatenado
    // com o marcador virou ["<json do histórico>", {marcador}].
    const corrupt = [JSON.stringify(three), marker]
    const seed = (messages: unknown[]) =>
      db`INSERT INTO chat_history(id,user_id,messages,status)
        VALUES(${conversation},${user},${JSON.stringify(messages)}::text::jsonb,'completed')`
    const storedMessages = async () => {
      const row = await stored()
      expect(row.type).toBe('array')
      return JSON.parse(row.messages) as Record<string, unknown>[]
    }

    it('GET devolve o histórico inteiro e válido', async () => {
      await seed(corrupt)
      const out = await getChatHistory(f, user, conversation)
      expect(out.messages).toEqual([
        { role: 'user', content: 'quero uma dieta', created_at: '2026-11-01T10:00:00.000Z' },
        { role: 'assistant', content: 'Vou montar!' },
        { role: 'user', content: 'obrigado' },
      ])
    })

    it('expande strings aninhadas, descarta o que não é mensagem e preserva a ordem', async () => {
      await seed([
        JSON.stringify(JSON.stringify([three[0]])),
        'texto solto',
        42,
        null,
        { role: 'assistant' },
        { role: 7, content: 'x' },
        JSON.stringify({ role: 'assistant', content: 'uma só' }),
        { role: 'user', content: 'ok' },
      ])
      const out = await getChatHistory(f, user, conversation)
      expect(out.messages).toEqual([
        { role: 'user', content: 'quero uma dieta', created_at: '2026-11-01T10:00:00.000Z' },
        { role: 'assistant', content: 'uma só' },
        { role: 'user', content: 'ok' },
      ])
    })

    it('o modelo recebe o histórico normalizado e a gravação seguinte repara a linha', async () => {
      await seed(corrupt)
      await expect(send('oi')).resolves.toMatchObject({ message: { content: 'Combinado!' } })
      expect(
        modelMessages.every(
          (m) => ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string',
        ),
      ).toBe(true)
      const unstamped = modelMessages.map((m) =>
        m.content.replace(/^\[\d{2}\/\d{2} \d{2}:\d{2}\] /, ''),
      )
      expect(unstamped.slice(-5)).toEqual([
        'quero uma dieta',
        'Vou montar!',
        'obrigado',
        DIET_COMPLETED_MARKER,
        'oi',
      ])
      const saved = await storedMessages()
      expect(saved.map(({ role, content }) => ({ role, content }))).toEqual([
        ...three.map(({ role, content }) => ({ role, content })),
        marker,
        { role: 'user', content: 'oi' },
        { role: 'assistant', content: 'Combinado!' },
      ])
      expect(saved[0].at).toBe('2026-11-01T10:00:00.000Z')
    })

    it('marcador anexado durante a resposta do modelo sobrevive à reparação', async () => {
      await seed(corrupt)
      onModelCall = () => appendDietCompletedMarker(db, conversation, randomUUID())
      await send('valeu')
      const saved = await storedMessages()
      expect(saved.map((m) => m.content)).toEqual([
        'quero uma dieta',
        'Vou montar!',
        'obrigado',
        DIET_COMPLETED_MARKER,
        DIET_COMPLETED_MARKER,
        'valeu',
        'Combinado!',
      ])
    })
  })
})
