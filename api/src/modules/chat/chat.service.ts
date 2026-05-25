import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import type { ChatMessageBody, ChatResponse } from './chat.schemas.js'

// ─── System prompt para coleta de dados e geração de dieta ───────────────────

const DIET_SYSTEM_PROMPT = `Você é o CalorIA, um nutricionista virtual especializado em criar dietas personalizadas.

Seu objetivo é coletar informações do usuário de forma natural e amigável através de uma conversa,
e ao final gerar uma dieta personalizada e detalhada.

## Informações que você DEVE coletar:
1. **Dados físicos**: peso atual (kg), altura (cm), idade ou data de nascimento
2. **Objetivo**: perder peso / manter peso / ganhar massa muscular / ganhar peso
3. **Nível de atividade física**: sedentário / levemente ativo / moderado / ativo / muito ativo
4. **Restrições alimentares**: vegetariano, vegano, sem glúten, sem lactose, halal, kosher, etc.
5. **Alergias alimentares**: amendoim, frutos do mar, ovos, etc.
6. **Preferências**: alimentos que gosta/não gosta
7. **Quantas refeições por dia prefere**: 3, 4, 5 ou 6 refeições

## Regras importantes:
- Faça **uma pergunta por vez** para não sobrecarregar o usuário
- Seja **amigável, encorajador e motivador**
- Quando tiver todas as informações necessárias, diga que vai gerar a dieta
- Responda em **português brasileiro**
- Respostas devem ser **concisas** (máx 3 parágrafos)

## Quando tiver todos os dados:
Calcule o **TDEE** (Total Daily Energy Expenditure) usando a fórmula de Mifflin-St Jeor
e defina as calorias e macros baseado no objetivo do usuário.
Retorne a dieta em formato estruturado quando solicitado pelo sistema.

Lembre-se: você é um assistente, não um médico. Sempre oriente o usuário a consultar um
profissional de saúde para questões médicas.`

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ChatHistory {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface StoredConversation {
  id: string
  user_id: string
  messages: ChatHistory[]
  created_at: string
  updated_at: string
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

/**
 * Processa uma mensagem do usuário e retorna a resposta da IA.
 *
 * Fase 1: armazena histórico em memória (temporário).
 * Fase 2: persistirá no banco via tabela chat_history.
 */
export async function sendChatMessage(
  fastify: FastifyInstance,
  userId: string,
  data: ChatMessageBody,
): Promise<ChatResponse> {
  // Carrega ou inicia a conversa
  const conversationId = data.conversation_id ?? randomUUID()
  const history = await getOrCreateConversation(fastify, userId, conversationId)

  // Adiciona a mensagem do usuário ao histórico
  history.push({ role: 'user', content: data.message })

  // Chama a API da OpenAI com o histórico completo
  let assistantMessage: string
  try {
    const completion = await fastify.openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: DIET_SYSTEM_PROMPT },
        ...history,
      ],
      max_tokens: 800,
      temperature: 0.7,
    })

    assistantMessage = completion.choices[0]?.message?.content ?? 'Desculpe, não consegui processar sua mensagem.'
  } catch (err) {
    fastify.log.error({ err }, 'Erro ao chamar OpenAI')
    throw new AppError(502, 'AI_ERROR', 'Serviço de IA temporariamente indisponível')
  }

  // Adiciona resposta da IA ao histórico
  history.push({ role: 'assistant', content: assistantMessage })

  // Persiste o histórico no banco
  await saveConversation(fastify, userId, conversationId, history)

  const now = new Date().toISOString()
  return {
    conversation_id: conversationId,
    message: {
      role: 'assistant',
      content: assistantMessage,
      created_at: now,
    },
    diet_generated: false, // Será true na Fase 2 quando a IA gerar a dieta
    diet_id: null,
  }
}

// ─── Helpers (persistência será expandida na Fase 2) ─────────────────────────

async function getOrCreateConversation(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
): Promise<ChatHistory[]> {
  // Fase 1: busca histórico no banco se a conversa já existe
  try {
    const [row] = await fastify.db<{ messages: ChatHistory[] }[]>`
      SELECT messages
      FROM chat_history
      WHERE id = ${conversationId}
        AND user_id = ${userId}
    `
    if (row) {
      return row.messages
    }
  } catch {
    // Tabela ainda não existe na Fase 1 — silencia o erro
    fastify.log.debug('Tabela chat_history não encontrada (será criada na Fase 2)')
  }

  return []
}

async function saveConversation(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  messages: ChatHistory[],
): Promise<void> {
  // Fase 1: persistência será implementada na Fase 2 (após criar a tabela)
  try {
    const messagesStr = JSON.stringify(messages)
    await fastify.db`
      INSERT INTO chat_history (id, user_id, messages)
      VALUES (${conversationId}, ${userId}, ${messagesStr}::jsonb)
      ON CONFLICT (id) DO UPDATE
        SET messages    = ${messagesStr}::jsonb,
            updated_at  = NOW()
    `
  } catch {
    // Silencia erro enquanto a tabela não existe (Fase 1)
    fastify.log.debug('Não foi possível persistir histórico (tabela será criada na Fase 2)')
  }
}
