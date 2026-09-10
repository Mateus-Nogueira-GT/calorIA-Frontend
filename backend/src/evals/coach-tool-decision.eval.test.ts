import { readFileSync } from 'node:fs'
import OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
import {
  COLLECT_DIET_DATA_TOOL,
  assembleSystemPrompt,
  buildSystemPrompt,
} from '../modules/chat/chat.service.js'
import { env } from '../shared/env.js'

/**
 * OP5: eval OFFLINE e OPT-IN. Chama o modelo de verdade (o mais barato que
 * decida tool calls) e verifica só UMA coisa por conversa: chamou ou não a
 * tool. Não roda no CI: `RUN_AI_EVALS=1 npm test -- src/evals`.
 */

interface Fixture {
  name: string
  hasActiveDiet: boolean
  knownData: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  expectTool: boolean | 'either'
  healthConditionsNonEmptyIfCalled?: boolean
}

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/coach-conversations.json', import.meta.url), 'utf8'),
) as Fixture[]

describe.skipIf(!process.env.RUN_AI_EVALS)('eval: decisão de tool do coach', () => {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })
  const model = process.env.EVAL_MODEL ?? 'openai/gpt-5-mini'

  it.each(fixtures)(
    '$name',
    async (f) => {
      const system = assembleSystemPrompt(
        buildSystemPrompt('motivational'),
        '',
        f.knownData,
        f.hasActiveDiet,
      )
      const completion = await openai.chat.completions.create(
        {
          model,
          messages: [{ role: 'system', content: system }, ...f.messages],
          tools: [COLLECT_DIET_DATA_TOOL],
          tool_choice: 'auto',
          parallel_tool_calls: false,
          max_tokens: 2000,
        },
        { timeout: 60_000 },
      )
      const choice = completion.choices[0]
      const called = choice.finish_reason === 'tool_calls' && !!choice.message.tool_calls?.length
      if (f.expectTool !== 'either') expect(called).toBe(f.expectTool)
      if (called && f.healthConditionsNonEmptyIfCalled) {
        const args = JSON.parse(choice.message.tool_calls?.[0]?.function.arguments ?? '{}') as {
          health_conditions?: string[]
        }
        expect(args.health_conditions?.length ?? 0).toBeGreaterThan(0)
      }
    },
    90_000,
  )
})
