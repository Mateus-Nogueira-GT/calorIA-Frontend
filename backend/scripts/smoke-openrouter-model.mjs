#!/usr/bin/env node
// Opt-in: three real OpenRouter calls, no database reads/writes or user data.
// Run after npm run build, with the deployment environment already loaded.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import OpenAI from 'openai'
import { env } from '../dist/shared/env.js'
import { fakeFastify } from '../dist/shared/testing/fake-fastify.js'
import { COLLECT_DIET_DATA_TOOL, sendChatMessage } from '../dist/modules/chat/chat.service.js'
import { analyzePhoto } from '../dist/modules/scanner/scanner.service.js'

assert.equal(process.env.AI_MODEL_SMOKE, '1', 'Set AI_MODEL_SMOKE=1 to authorize paid smoke calls')
const target = 'openai/gpt-6.1-sol'
assert.equal(env.OPENAI_MODEL, target)
assert.equal(env.OPENAI_VISION_MODEL, target)
assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'openrouter.ai')

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL,
  timeout: 50_000,
  maxRetries: 0,
})
const { fastify } = fakeFastify()
fastify.openai = client
const usage = []
fastify.log = {
  info: (entry) => { if (entry?.ai_usage) usage.push(entry.ai_usage) },
  warn: () => {},
  error: (entry) => {
    const error = entry?.err
    if (error) console.error('[model-smoke] upstream:', String(error.message || error.code || 'UNKNOWN').replaceAll(env.OPENAI_API_KEY, '<REDACTED>'))
  },
  debug: () => {},
}

try {
  const chat = await sendChatMessage(fastify, '11111111-1111-4111-8111-111111111111', {
    message: 'Olá! Quero entender como registrar minhas refeições no aplicativo.',
  })
  assert.ok(chat.message.content.trim())
  assert.equal(chat.diet_generated, false)
  console.log('[model-smoke] chat com tools/contexto do app: OK')

  const completion = await client.chat.completions.create({
    model: target,
    messages: [{ role: 'user', content: 'Teste de contrato, sem executar a ferramenta. Dados fictícios: 80kg, 175cm, 30 anos, masculino, manter peso, sedentário, 4 refeições, sem restrições, alergias, preferências ou condições de saúde. Preencha a ferramenta com esses dados.' }],
    tools: [COLLECT_DIET_DATA_TOOL],
    tool_choice: { type: 'function', function: { name: 'collect_diet_data' } },
    parallel_tool_calls: false,
    reasoning_effort: 'low',
    max_tokens: 4000,
  })
  const call = completion.choices[0]?.message.tool_calls?.[0]
  assert.equal(call?.function.name, 'collect_diet_data')
  assert.ok(JSON.parse(call.function.arguments))
  // Tool is inspected only: never execute diet generation.
  console.log('[model-smoke] tool calling via OpenRouter Chat Completions: OK')

  const image = readFileSync(new URL('../../app/assets/app-icon-1024.png', import.meta.url))
  try {
    const scan = await analyzePhoto(fastify, `data:image/png;base64,${image.toString('base64')}`, null)
    assert.equal(scan.items.length, 1)
  } catch (error) {
    // Non-food is a valid structured response to this public app icon.
    if (error?.code !== 'NOT_FOOD') throw error
  }
  console.log('[model-smoke] visão + structured output do scanner: OK')
  console.log('[model-smoke] modelo confirmado:', target)
  console.log('[model-smoke] tokens das chamadas do app:', JSON.stringify(usage.map(({ feature, model, promptTokens, completionTokens }) => ({ feature, model, promptTokens, completionTokens }))))
} catch (error) {
  // Never dump SDK request/response objects: they can contain auth headers.
  console.error('[model-smoke] FAIL:', error?.code || error?.name || 'UNKNOWN', 'status:', error?.status || error?.statusCode || 'n/a')
  process.exitCode = 1
}
