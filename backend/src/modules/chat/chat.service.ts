import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import type OpenAI from 'openai'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import {
  aiDietPlanSchema,
  collectedUserDataSchema,
  type CollectedUserData,
} from '../../shared/diet-ai-schema.js'
import { saveDietToDb } from '../diets/diets.service.js'
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
  empathetic:
    'TOM: seja acolhedor e empático, valide os sentimentos do usuário antes de orientar.',
  scientific:
    'TOM: explique o "porquê" das recomendações com base técnica e evidências, de forma didática.',
}

function buildSystemPrompt(personality: string | null | undefined): string {
  const tone = PERSONALITY_TONES[personality ?? 'motivational'] ?? PERSONALITY_TONES.motivational
  return `${CHAT_SYSTEM_PROMPT}\n\n## ${tone}`
}

// Timeout do cliente OpenAI menor que o maxDuration da função (60s na Vercel),
// pra falhar com erro tratável antes de o gateway cortar em 502.
const OPENAI_TIMEOUT_MS = 50_000

/** Mapeia erros do SDK OpenAI para AppError com status/mensagem claros. */
function mapOpenAIError(err: unknown): AppError {
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
      'Chame esta função APENAS quando tiver coletado TODOS os dados obrigatórios do usuário (peso, altura, idade, sexo, objetivo, nível de atividade e número de refeições por dia). Não chame antes de ter todas essas informações.',
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
      ],
      properties: {
        weight_kg: { type: 'number', description: 'Peso em kg' },
        height_cm: { type: 'number', description: 'Altura em cm' },
        age: { type: 'integer', description: 'Idade em anos' },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        goal: { type: 'string', enum: ['lose_weight', 'maintain', 'gain_muscle', 'gain_weight'] },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        },
        meals_per_day: { type: 'integer', minimum: 3, maximum: 6 },
        dietary_restrictions: { type: 'array', items: { type: 'string' } },
        allergies: { type: 'array', items: { type: 'string' } },
        food_preferences: {
          type: ['string', 'null'],
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

// ─── Prompt de geração de dieta ────────────────────────────────────────────

function buildDietGenerationPrompt(userData: CollectedUserData): string {
  const goalLabels: Record<string, string> = {
    lose_weight: 'perda de peso',
    maintain: 'manutenção de peso',
    gain_muscle: 'ganho de massa muscular',
    gain_weight: 'ganho de peso',
  }
  const activityLabels: Record<string, string> = {
    sedentary: 'sedentário',
    light: 'levemente ativo',
    moderate: 'moderadamente ativo',
    active: 'ativo',
    very_active: 'muito ativo',
  }

  return `Crie um plano alimentar COMPLETO de 7 dias para o seguinte perfil:

**Dados do usuário:**
- Peso: ${userData.weight_kg}kg
- Altura: ${userData.height_cm}cm
- Idade: ${userData.age} anos
- Sexo: ${userData.gender === 'male' ? 'Masculino' : userData.gender === 'female' ? 'Feminino' : 'Outro'}
- Objetivo: ${goalLabels[userData.goal]}
- Nível de atividade: ${activityLabels[userData.activity_level]}
- Refeições por dia: ${userData.meals_per_day}
${userData.dietary_restrictions.length > 0 ? `- Restrições: ${userData.dietary_restrictions.join(', ')}` : ''}
${userData.allergies.length > 0 ? `- Alergias: ${userData.allergies.join(', ')}` : ''}
${userData.food_preferences ? `- Preferências: ${userData.food_preferences}` : ''}

**Instruções:**
1. Calcule o TDEE usando Mifflin-St Jeor e ajuste pelo objetivo
2. Distribua as ${userData.meals_per_day} refeições diárias coerentemente
3. Use alimentos brasileiros comuns e acessíveis (base TACO)
4. Varie os alimentos entre os 7 dias — evite repetição excessiva
5. Especifique SEMPRE a quantidade em gramas e o preparo
6. Calcule calorias e macros com precisão para cada item
7. O plano deve ser prático e realista para o dia a dia`
}

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
  const systemPrompt = buildSystemPrompt(profile?.coach_personality)

  // ── Chamada à OpenAI com suporte a function calling ──────────────────────
  let completion: Awaited<ReturnType<typeof fastify.openai.chat.completions.create>>
  try {
    completion = await fastify.openai.chat.completions.create(
      {
        model: env.OPENAI_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        tools: [COLLECT_DIET_DATA_TOOL],
        tool_choice: 'auto',
        max_tokens: 600,
        temperature: 0.7,
      },
      { timeout: OPENAI_TIMEOUT_MS },
    )
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao chamar OpenAI chat')
    throw mapOpenAIError(err)
  }

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
    const fallbackMsg =
      'Preciso de mais algumas informações antes de gerar sua dieta. Poderia confirmar seu peso e altura?'
    history.push({ role: 'assistant', content: fallbackMsg })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: { role: 'assistant', content: fallbackMsg, created_at: new Date().toISOString() },
      diet_generated: false,
      diet_id: null,
    }
  }

  const userData = parseResult.data
  const userMessage = userData.message_to_user

  // Sinaliza que está gerando
  await persistHistory(fastify, userId, conversationId, history, 'generating')

  // ── Gera o plano alimentar estruturado ───────────────────────────────────
  let dietPlan: import('../../shared/diet-ai-schema.js').AiDietPlan
  try {
    const dietCompletion = await fastify.openai.beta.chat.completions.parse(
      {
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista especializado. Crie planos alimentares detalhados, precisos e com alimentos brasileiros. Retorne SOMENTE o JSON do plano, sem texto adicional.',
          },
          { role: 'user', content: buildDietGenerationPrompt(userData) },
        ],
        response_format: zodResponseFormat(aiDietPlanSchema, 'diet_plan'),
        max_tokens: 8000,
        temperature: 0.3, // baixa temperatura para saída mais precisa
      },
      { timeout: OPENAI_TIMEOUT_MS },
    )

    const parsed = dietCompletion.choices[0].message.parsed
    if (!parsed) throw new Error('OpenAI retornou dieta vazia')
    dietPlan = parsed
  } catch (err) {
    // Não deixa o usuário preso em "generating": reseta o status e responde de
    // forma amigável (diet_generated:false) em vez de estourar um 502 genérico.
    fastify.log.error({ err }, 'Erro ao gerar dieta estruturada')
    const retryMsg =
      'Tive um problema ao gerar sua dieta agora. Podemos tentar de novo em instantes?'
    history.push({ role: 'assistant', content: retryMsg })
    await persistHistory(fastify, userId, conversationId, history, 'collecting')
    return {
      conversation_id: conversationId,
      message: { role: 'assistant', content: retryMsg, created_at: new Date().toISOString() },
      diet_generated: false,
      diet_id: null,
    }
  }

  // ── Persiste a dieta no banco ────────────────────────────────────────────
  const dietId = await saveDietToDb(fastify, userId, conversationId, userData, dietPlan)

  // Atualiza perfil do usuário com os dados coletados
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
      updated_at     = NOW()
    WHERE id = ${userId}
  `

  // Mensagem final no histórico
  history.push({ role: 'assistant', content: userMessage })
  await persistHistory(fastify, userId, conversationId, history, 'completed')

  fastify.log.info({ userId, dietId }, 'Dieta gerada com sucesso')

  return {
    conversation_id: conversationId,
    message: { role: 'assistant', content: userMessage, created_at: new Date().toISOString() },
    diet_generated: true,
    diet_id: dietId,
  }
}

// ─── Histórico de chat ────────────────────────────────────────────────────────

export async function getChatHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
): Promise<{ messages: ChatHistoryMessage[]; status: string }> {
  const [row] = await fastify.db<{ messages: ChatHistoryMessage[]; status: string }[]>`
    SELECT messages, status
    FROM chat_history
    WHERE id = ${conversationId} AND user_id = ${userId}
  `

  if (!row) throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada')
  return row
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadHistory(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
): Promise<ChatHistoryMessage[]> {
  try {
    const [row] = await fastify.db<{ messages: ChatHistoryMessage[] }[]>`
      SELECT messages FROM chat_history
      WHERE id = ${conversationId} AND user_id = ${userId}
    `
    return row?.messages ?? []
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
