import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type OpenAI from 'openai'
import { buildModelsField, logAiUsage } from '../../shared/ai-usage.js'
import { type CollectedUserData, collectedUserDataSchema } from '../../shared/diet-ai-schema.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { assessSafety, describeInvalidFields } from '../../shared/guardrails/index.js'
import { createDietJob } from '../diets/jobs.service.js'
import { fetchUserContext, formatKnownData, formatUserContext } from './chat-context.js'
import type { ChatMessageBody, ChatResponse } from './chat.schemas.js'

// ─── System prompt ─────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `Você é o CalorIA, um nutricionista virtual simpático e motivador.
Seu objetivo é coletar informações do usuário em forma de conversa natural e, ao final, gerar um plano alimentar personalizado.

## DADOS QUE VOCÊ DEVE COLETAR (obrigatórios):
1. Peso atual em kg
2. Altura em cm
3. Idade (ou data de nascimento)
4. Sexo (masculino / feminino / outro)
5. Objetivo: perder peso / manter peso / ganhar massa / ganhar peso
6. Nível de atividade física: sedentário / levemente ativo / moderadamente ativo / ativo / muito ativo
7. Quantas refeições por dia prefere (3 a 6)

## DADOS OPCIONAIS (pergunte se não mencionados):
- Restrições alimentares (vegetariano, vegano, sem glúten, sem lactose, etc.)
- Alergias alimentares
- Alimentos que não gosta ou não come

## REGRAS:
- Faça UMA pergunta por vez — nunca uma lista de perguntas
- Seja breve e amigável (máx 2 parágrafos por resposta)
- Responda sempre em português brasileiro
- Quando tiver TODOS os dados obrigatórios, chame a função collect_diet_data
- Não mencione que vai "chamar uma função" — apenas diga que vai gerar a dieta
- Você NÃO é médico: oriente o usuário a consultar profissionais para questões de saúde

## CÁLCULO (para referência interna):
Use Mifflin-St Jeor para BMR, multiplique pelo fator de atividade (TDEE) e ajuste pelo objetivo:
- Perder peso: TDEE − 500 kcal | Manter: TDEE | Ganhar massa: TDEE + 300 | Ganhar peso: TDEE + 500`

// Trecho de tom adicionado ao prompt conforme a personalidade escolhida no onboarding.
const PERSONALITY_TONES: Record<string, string> = {
  motivational:
    'TOM: seja encorajador e entusiasmado, celebre cada progresso e use energia positiva.',
  direct: 'TOM: seja objetivo e direto ao ponto, sem rodeios nem floreios.',
  empathetic: 'TOM: seja acolhedor e empático, valide os sentimentos do usuário antes de orientar.',
  scientific:
    'TOM: explique o "porquê" das recomendações com base técnica e evidências, de forma didática.',
}

export function buildSystemPrompt(personality: string | null | undefined): string {
  const tone = PERSONALITY_TONES[personality ?? 'motivational'] ?? PERSONALITY_TONES.motivational
  return `${CHAT_SYSTEM_PROMPT}\n\n## ${tone}`
}

const CONTEXT_INSTRUCTION =
  'INSTRUÇÃO: quando o usuário perguntar sobre o dia, metas ou progresso, responda com os ' +
  'números do CONTEXTO DO USUÁRIO acima. Nunca invente valores que não estejam nele.'

const KNOWN_DATA_INSTRUCTION =
  'INSTRUÇÃO: se TODOS os dados obrigatórios (peso, altura, idade, sexo, objetivo, nível de ' +
  'atividade e refeições/dia) constam em DADOS JÁ CONHECIDOS, NÃO refaça as perguntas — envie ' +
  'UMA mensagem confirmando esses dados e perguntando se algo mudou. Se o usuário confirmar, ' +
  'chame collect_diet_data com esses valores. Pergunte individualmente apenas os campos ' +
  'ausentes ou que o usuário disser que mudaram.'

/**
 * Quando já existe dieta ativa, esta instrução SOBRESCREVE a parte do
 * KNOWN_DATA_INSTRUCTION que manda chamar a tool assim que o usuário confirma
 * os dados. Sem isso, depois da primeira dieta qualquer "ok"/"obrigado" era
 * confirmação e a IA gerava um plano novo a cada mensagem.
 */
const EXISTING_DIET_INSTRUCTION =
  'INSTRUÇÃO IMPORTANTE: o usuário JÁ TEM uma dieta ativa. NÃO chame ' +
  'collect_diet_data para confirmar dados, nem em resposta a agradecimentos, ' +
  '"ok", "sim" ou perguntas sobre a dieta atual. Chame a tool APENAS se o ' +
  'usuário pedir EXPLICITAMENTE um plano novo ou uma alteração no plano ' +
  '(ex.: "gera outra dieta", "quero trocar meu cardápio", "refaz com menos ' +
  'carboidrato"). Cada chamada gera um plano NOVO que substitui o atual e ' +
  'zera as refeições já marcadas como concluídas — por isso, na dúvida, ' +
  'pergunte antes em vez de chamar a tool.'

/** Junta prompt base + contexto/known-data + instruções (só quando há bloco). */
export function assembleSystemPrompt(
  base: string,
  contextBlock: string,
  knownData: string,
  hasActiveDiet = false,
): string {
  const parts = [base]
  if (contextBlock) {
    parts.push(contextBlock, CONTEXT_INSTRUCTION)
  }
  if (knownData) {
    parts.push(knownData, KNOWN_DATA_INSTRUCTION)
  }
  // Por último: em conflito com a instrução acima, esta é a que vale.
  if (hasActiveDiet) {
    parts.push(EXISTING_DIET_INSTRUCTION)
  }
  return parts.join('\n\n')
}

// Timeout do cliente OpenAI menor que o maxDuration da função (60s na Vercel),
// pra falhar com erro tratável antes de o gateway cortar em 502.
const OPENAI_TIMEOUT_MS = 50_000

/**
 * G6 da spec: só as últimas N mensagens vão para o modelo — sem janela, o
 * custo/latência cresciam linearmente com a conversa. O histórico COMPLETO
 * continua persistido e disponível no GET /chat/history.
 */
export const CHAT_CONTEXT_WINDOW = 30

export function windowedHistory<T>(history: T[], limit: number = CHAT_CONTEXT_WINDOW): T[] {
  return history.length > limit ? history.slice(-limit) : history
}

/** Mapeia erros do SDK OpenAI para AppError com status/mensagem claros. */
export function mapOpenAIError(err: unknown): AppError {
  const e = err as { status?: number; name?: string; code?: string }
  if (e?.name?.includes('Timeout') || e?.code === 'ETIMEDOUT') {
    return new AppError(504, 'AI_TIMEOUT', 'A IA demorou demais para responder. Tente novamente.')
  }
  if (e?.status === 401 || e?.status === 429) {
    return new AppError(502, 'AI_UNAVAILABLE', 'Serviço de IA indisponível no momento.')
  }
  return new AppError(502, 'AI_ERROR', 'Serviço de IA temporariamente indisponível')
}

// ─── Tool definition para coleta de dados ─────────────────────────────────

const COLLECT_DIET_DATA_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'collect_diet_data',
    description:
      'Chame esta função APENAS quando tiver coletado TODOS os dados obrigatórios do usuário (peso, altura, idade, sexo, objetivo, nível de atividade e número de refeições por dia). Não chame antes de ter todas essas informações. Pergunte antes sobre gestação e condições de saúde e preencha health_conditions.',
    parameters: {
      type: 'object',
      required: [
        'weight_kg',
        'height_cm',
        'age',
        'gender',
        'goal',
        'activity_level',
        'meals_per_day',
        'message_to_user',
        'dietary_restrictions',
        'allergies',
        'food_preferences',
        'health_conditions',
      ],
      properties: {
        weight_kg: { type: 'number', minimum: 30, maximum: 300, description: 'Peso em kg' },
        height_cm: {
          type: 'number',
          minimum: 120,
          maximum: 250,
          description: 'Altura em centímetros (175, nunca 1.75)',
        },
        age: { type: 'integer', minimum: 10, maximum: 100, description: 'Idade em anos' },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        goal: { type: 'string', enum: ['lose_weight', 'maintain', 'gain_muscle', 'gain_weight'] },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        },
        meals_per_day: { type: 'integer', minimum: 3, maximum: 6 },
        dietary_restrictions: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', maxLength: 40 },
        },
        allergies: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 40 } },
        health_conditions: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', maxLength: 40 },
          description:
            'Gestação/amamentação, doenças diagnosticadas (diabetes, renal, cardíaca…), ' +
            'transtorno alimentar, medicação contínua. Vazio se o usuário disse não ter nenhuma.',
        },
        food_preferences: {
          type: ['string', 'null'],
          maxLength: 300,
          description: 'Preferências e aversões alimentares',
        },
        message_to_user: {
          type: 'string',
          description: 'Mensagem encorajadora enquanto a dieta é gerada',
        },
      },
      additionalProperties: false,
    },
  },
}

// A geração da dieta em si acontece de forma assíncrona (1 dia por chamada) no
// jobs.service — ver createDietJob/processJobStep. Aqui só coletamos os dados e
// enfileiramos o job.

// ─── Tipos internos ─────────────────────────────────────────────────────────

interface ChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

// ─── Serviço principal ───────────────────────────────────────────────────────

export async function sendChatMessage(
  fastify: FastifyInstance,
  userId: string,
  data: ChatMessageBody,
): Promise<ChatResponse> {
  const conversationId = data.conversation_id ?? randomUUID()
  const history = await loadHistory(fastify, userId, conversationId)

  history.push({ role: 'user', content: data.message })

  // Personaliza o tom do coach conforme a preferência do usuário.
  const [profile] = await fastify.db<{ coach_personality: string | null }[]>`
    SELECT coach_personality FROM profiles WHERE id = ${userId}
  `

  // I1/I2: contexto do usuário (progresso do dia, metas) + dados já conhecidos.
  // Coleta tolerante a falha — nunca bloqueia o chat.
  const context = await fetchUserContext(fastify, userId, {
    date: data.date,
    tzOffsetMinutes: data.tzOffsetMinutes,
  })
  const systemPrompt = assembleSystemPrompt(
    buildSystemPrompt(profile?.coach_personality),
    formatUserContext(context),
    formatKnownData(context),
    context.diet !== null,
  )

  // ── Chamada à OpenAI com suporte a function calling ──────────────────────
  let completion: Awaited<ReturnType<typeof fastify.openai.chat.completions.create>>
  try {
    completion = await fastify.openai.chat.completions.create(
      {
        model: env.OPENAI_MODEL,
        // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
        ...buildModelsField(env.OPENAI_MODEL, env.OPENAI_FALLBACK_MODELS),
        messages: [{ role: 'system', content: systemPrompt }, ...windowedHistory(history)],
        tools: [COLLECT_DIET_DATA_TOOL],
        tool_choice: 'auto',
        // GPT-5 é reasoning model: não aceita temperature custom (só o default) e
        // gasta "reasoning tokens" do orçamento — por isso um limite mais folgado.
        max_tokens: 2000,
        // Reasoning baixo: coletar dados / decidir a tool não precisa de raciocínio
        // profundo, e o reasoning alto estourava os 60s da função (timeout).
        reasoning_effort: 'low',
      },
      { timeout: OPENAI_TIMEOUT_MS },
    )
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao chamar OpenAI chat')
    throw mapOpenAIError(err)
  }

  logAiUsage(fastify, { feature: 'chat', model: env.OPENAI_MODEL, userId, usage: completion.usage })

  const choice = completion.choices[0]

  // ── Detecta chamada de função: IA coletou todos os dados ─────────────────
  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCall = choice.message.tool_calls[0]

    if (toolCall.function.name === 'collect_diet_data') {
      return handleDietGeneration(fastify, userId, conversationId, history, toolCall)
    }
  }

  // ── Resposta de conversa normal ──────────────────────────────────────────
  const assistantMessage =
    choice.message.content ?? 'Desculpe, não consegui processar sua mensagem.'
  history.push({ role: 'assistant', content: assistantMessage })
  await persistHistory(fastify, userId, conversationId, history, 'collecting')

  return {
    conversation_id: conversationId,
    message: { role: 'assistant', content: assistantMessage, created_at: new Date().toISOString() },
    diet_generated: false,
    diet_id: null,
    diet_job_id: null,
  }
}

// ─── Geração da dieta (chamado quando IA usa a function) ─────────────────────

async function handleDietGeneration(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  history: ChatHistoryMessage[],
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall,
): Promise<ChatResponse> {
  // Valida os dados coletados pela IA
  const rawArgs = JSON.parse(toolCall.function.arguments) as unknown
  const parseResult = collectedUserDataSchema.safeParse(rawArgs)

  if (!parseResult.success) {
    fastify.log.warn(
      { errors: parseResult.error.flatten() },
      'Dados coletados pela IA são inválidos',
    )
    // S4: pergunta específica por campo (altura em metros, peso implausível…).
    const fallbackMsg = describeInvalidFields(parseResult.error.issues, rawArgs)
    history.push({ role: 'assistant', content: fallbackMsg })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: { role: 'assistant', content: fallbackMsg, created_at: new Date().toISOString() },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
  }

  const userData = parseResult.data

  // S2/S3: menor de idade, condição de saúde ou IMC baixo com déficit → o coach
  // recusa em TEXTO (status collecting), sem job e sem gravar perfil. A recusa
  // fica no histórico: nas rodadas seguintes o modelo a vê e não insiste (S6).
  const safety = assessSafety(userData)
  if (!safety.ok) {
    fastify.log.info({ userId, reason: safety.reason }, 'Geração de dieta recusada por segurança')
    history.push({ role: 'assistant', content: safety.userMessage })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: {
        role: 'assistant',
        content: safety.userMessage,
        created_at: new Date().toISOString(),
      },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
  }

  const userMessage = safety.warningMessage
    ? `${userData.message_to_user}\n\n${safety.warningMessage}`
    : userData.message_to_user

  // ── Enfileira o job de geração (gera 1 dia por chamada, via polling) ──────
  // Não gera os 7 dias aqui: estouraria o limite de tempo da função serverless.
  let job: { jobId: string; dietId: string }
  try {
    job = await createDietJob(fastify, userId, conversationId, userData)
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao criar job de geração de dieta')
    const retryMsg =
      'Tive um problema ao iniciar sua dieta agora. Podemos tentar de novo em instantes?'
    history.push({ role: 'assistant', content: retryMsg })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: { role: 'assistant', content: retryMsg, created_at: new Date().toISOString() },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    }
  }

  // Atualiza perfil do usuário com os dados coletados.
  // birth_date: aproximação (1º de julho do ano correspondente à idade) gravada
  // APENAS se ainda for NULL — permite pré-carregar a idade em conversas
  // futuras sem sobrescrever uma data real informada pelo usuário (F6).
  await fastify.db`
    UPDATE profiles
    SET
      weight_kg      = ${userData.weight_kg},
      height_cm      = ${userData.height_cm},
      gender         = ${userData.gender},
      goal           = ${userData.goal},
      activity_level = ${userData.activity_level},
      dietary_restrictions = ${userData.dietary_restrictions},
      allergies      = ${userData.allergies},
      birth_date     = COALESCE(birth_date, MAKE_DATE(EXTRACT(YEAR FROM NOW())::INT - ${userData.age}, 7, 1)),
      updated_at     = NOW()
    WHERE id = ${userId}
  `

  // Sinaliza que está gerando; o front faz polling em /diets/jobs/:id/step.
  history.push({ role: 'assistant', content: userMessage })
  await persistHistory(fastify, userId, conversationId, history, 'generating')

  fastify.log.info({ userId, jobId: job.jobId }, 'Job de dieta enfileirado')

  return {
    conversation_id: conversationId,
    message: { role: 'assistant', content: userMessage, created_at: new Date().toISOString() },
    diet_generated: false,
    diet_id: null,
    diet_job_id: job.jobId,
  }
}

// ─── Histórico de chat ────────────────────────────────────────────────────────

export async function getChatHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
): Promise<{ messages: ChatHistoryMessage[]; status: string }> {
  const [row] = await fastify.db<{ messages: unknown; status: string }[]>`
    SELECT messages, status
    FROM chat_history
    WHERE id = ${conversationId} AND user_id = ${userId}
  `

  if (!row) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada')
  return { messages: normalizeHistory(row.messages), status: row.status }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Garante que o histórico seja sempre um array. Dependendo do driver/pooler, a
 * coluna JSONB `messages` pode voltar como string (JSON) em vez de array já
 * parseado — normalizamos os dois casos.
 */
export function normalizeHistory(raw: unknown): ChatHistoryMessage[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? (value as ChatHistoryMessage[]) : []
}

async function loadHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
): Promise<ChatHistoryMessage[]> {
  try {
    const [row] = await fastify.db<{ messages: unknown }[]>`
      SELECT messages FROM chat_history
      WHERE id = ${conversationId} AND user_id = ${userId}
    `
    return normalizeHistory(row?.messages)
  } catch {
    return []
  }
}

async function persistHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  messages: ChatHistoryMessage[],
  status: string,
): Promise<void> {
  try {
    const messagesStr = JSON.stringify(messages)
    await fastify.db`
      INSERT INTO chat_history (id, user_id, messages, status)
      VALUES (${conversationId}, ${userId}, ${messagesStr}::jsonb, ${status})
      ON CONFLICT (id) DO UPDATE
        SET messages   = ${messagesStr}::jsonb,
            status     = ${status},
            updated_at = NOW()
    `
  } catch (err) {
    fastify.log.warn({ err }, 'Falha ao persistir histórico de chat')
  }
}
