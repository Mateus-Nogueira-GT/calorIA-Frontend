import type { FastifyInstance } from 'fastify'

/**
 * Mock mínimo do FastifyInstance para testes de serviço: template tagueado do
 * postgres.js (com `begin`), logger que grava, e cliente OpenAI com handlers
 * injetáveis. Não importa vitest — é um arquivo de src comum.
 */

/** Rota: substring do SQL → linhas devolvidas, ou um Error para a query rejeitar. */
export type DbRoute = [substring: string, rows: unknown[] | Error]

export interface OpenAiHandlers {
  chatCreate?: (params: unknown) => Promise<unknown>
  parse?: (params: unknown) => Promise<unknown>
}

export interface FakeFastify {
  fastify: FastifyInstance
  calls: { sql: string; params: unknown[] }[]
  openaiCalls: { kind: 'chat' | 'parse'; params: Record<string, unknown> }[]
  logs: { level: string; msg: string }[]
}

export function fakeFastify(routes: DbRoute[] = [], openai: OpenAiHandlers = {}): FakeFastify {
  const calls: FakeFastify['calls'] = []
  const openaiCalls: FakeFastify['openaiCalls'] = []
  const logs: FakeFastify['logs'] = []

  const db = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const sql = strings.join(' ? ')
    calls.push({ sql, params })
    const rows = routes.find(([sub]) => sql.includes(sub))?.[1] ?? []
    if (rows instanceof Error) return Promise.reject(rows)
    return Promise.resolve(Object.assign([...rows], { count: rows.length }))
  }
  // biome-ignore lint/suspicious/noExplicitAny: mock mínimo do driver
  ;(db as any).begin = (fn: (sql: unknown) => Promise<unknown>) => fn(db)

  const logAt = (level: string) => (obj: unknown, msg?: string) => {
    logs.push({ level, msg: msg ?? (typeof obj === 'string' ? obj : JSON.stringify(obj)) })
  }
  const log = {
    info: logAt('info'),
    warn: logAt('warn'),
    error: logAt('error'),
    debug: logAt('debug'),
  }

  const notConfigured = (kind: string) => () =>
    Promise.reject(new Error(`fakeFastify: handler openai.${kind} não configurado`))
  const chatCreate = openai.chatCreate ?? notConfigured('chatCreate')
  const parse = openai.parse ?? notConfigured('parse')

  const fastify = {
    db,
    log,
    openai: {
      chat: {
        completions: {
          create: (params: Record<string, unknown>) => {
            openaiCalls.push({ kind: 'chat', params })
            return chatCreate(params)
          },
        },
      },
      beta: {
        chat: {
          completions: {
            parse: (params: Record<string, unknown>) => {
              openaiCalls.push({ kind: 'parse', params })
              return parse(params)
            },
          },
        },
      },
    },
  } as unknown as FastifyInstance

  return { fastify, calls, openaiCalls, logs }
}

/** Completion de chat mínima com resposta de texto. */
export function textCompletion(content: string, finishReason = 'stop') {
  return {
    choices: [
      {
        finish_reason: finishReason,
        message: { role: 'assistant', content, tool_calls: undefined },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** Completion de chat com chamada da tool collect_diet_data. */
export function toolCompletion(args: Record<string, unknown>, name = 'collect_diet_data') {
  return {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}
