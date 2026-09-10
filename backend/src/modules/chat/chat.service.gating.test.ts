import { describe, expect, it } from 'vitest'
import { fakeFastify, textCompletion } from '../../shared/testing/fake-fastify.js'
import { sendChatMessage } from './chat.service.js'

const USER = '11111111-1111-1111-1111-111111111111'
const CONV = '22222222-2222-2222-2222-222222222222'
const PENDING_SQL = "status IN ('pending', 'running')"
const PENDING_ROW = { id: 'job-1', diet_id: 'diet-1' }

describe('sendChatMessage — gating da tool (C1)', () => {
  it('com job pending/running, a request vai SEM tools e sem tool_choice', async () => {
    const { fastify, openaiCalls } = fakeFastify([[PENDING_SQL, [PENDING_ROW]]], {
      chatCreate: async () => textCompletion('Sua dieta está sendo gerada!'),
    })

    await sendChatMessage(fastify, USER, { message: 'ok', conversation_id: CONV })

    expect(openaiCalls).toHaveLength(1)
    const params = openaiCalls[0].params
    expect(params.tools).toBeUndefined()
    expect(params.tool_choice).toBeUndefined()
  })

  it('com job em andamento, o prompt avisa que já existe dieta (mesmo sem dieta ativa)', async () => {
    const { fastify, openaiCalls } = fakeFastify([[PENDING_SQL, [PENDING_ROW]]], {
      chatCreate: async () => textCompletion('ok'),
    })

    await sendChatMessage(fastify, USER, { message: 'ok', conversation_id: CONV })

    const messages = openaiCalls[0].params.messages as { role: string; content: string }[]
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('JÁ TEM uma dieta ativa')
  })

  it('sem job, a request leva a tool, tool_choice auto e parallel_tool_calls false', async () => {
    const { fastify, openaiCalls } = fakeFastify([], {
      chatCreate: async () => textCompletion('Qual seu peso?'),
    })

    await sendChatMessage(fastify, USER, { message: 'oi', conversation_id: CONV })

    const params = openaiCalls[0].params as {
      tools?: unknown[]
      tool_choice?: string
      parallel_tool_calls?: boolean
    }
    expect(params.tools).toHaveLength(1)
    expect(params.tool_choice).toBe('auto')
    expect(params.parallel_tool_calls).toBe(false)
  })
})
