import type { FastifyInstance } from 'fastify'
import type OpenAI from 'openai'
import { z } from 'zod'
import { BODY_LIMITS } from '../../shared/body-limits.js'
import type { TodayPlan } from '../diets/diets.schemas.js'
import { mealRef } from './chat-context.js'
import { normalizeMealValues } from './meal-values.js'

/**
 * Spec de 05/11 (ações com cartão): o PR #96 fez o coach parar de prometer o
 * que não faz. Aqui as recusas viram propostas — no mesmo padrão de
 * propose_meal_correction: a tool NÃO grava; o servidor valida e normaliza, o
 * app mostra um cartão e grava pelos endpoints de sempre quando o usuário toca.
 * Cada ação só é oferecida ao app que declara a marca em `client_features`.
 */
export const ACTION_FEATURES = ['log_meal', 'log_weight', 'complete_plan_meal'] as const
export type ActionFeature = (typeof ACTION_FEATURES)[number]

const MEAL_TYPE_LABELS = {
  breakfast: 'café da manhã',
  lunch: 'almoço',
  snack: 'lanche',
  dinner: 'jantar',
} as const

/** Diferença a partir da qual o peso novo pede conferência (digitação errada é comum). */
const WEIGHT_BIG_CHANGE_KG = 5

const opening = {
  type: 'string',
  maxLength: 200,
  description: 'Frase curta de abertura, SEM números (o app mostra os valores)',
}
const dayParam = { type: 'string', enum: ['today', 'yesterday'] }

export const PROPOSE_LOG_MEAL_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'propose_log_meal',
    description:
      'Propõe registrar no Diário algo que o usuário PEDIU para registrar (ex.: "registra 2 ovos no café"). ' +
      'NÃO grava: o app mostra os valores e o usuário confirma tocando em "Adicionar ao Diário". Vários ' +
      'alimentos numa frase viram UM registro com o peso e os valores somados.',
    parameters: {
      type: 'object',
      required: [
        'name',
        'weight_grams',
        'calories',
        'protein',
        'carbs',
        'fat',
        'fiber',
        'meal_type',
        'date',
        'message_to_user',
      ],
      properties: {
        name: {
          type: 'string',
          maxLength: 120,
          description: 'Ex.: "2 ovos cozidos + 1 pão francês"',
        },
        weight_grams: { type: 'number', minimum: 0.1, maximum: 5000 },
        calories: { type: 'number', minimum: 0 },
        protein: { type: 'number', minimum: 0 },
        carbs: { type: 'number', minimum: 0 },
        fat: { type: 'number', minimum: 0 },
        fiber: { type: ['number', 'null'], minimum: 0 },
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'snack', 'dinner'] },
        date: dayParam,
        message_to_user: opening,
      },
      additionalProperties: false,
    },
  },
}

export const PROPOSE_LOG_WEIGHT_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'propose_log_weight',
    description:
      'Propõe registrar na Evolução o peso que o usuário informou (ex.: "meu peso hoje é 78 kg"). NÃO ' +
      'grava e NÃO é pedido de plano novo: o usuário confirma tocando em "Registrar na Evolução".',
    parameters: {
      type: 'object',
      required: ['weight_kg', 'date', 'message_to_user'],
      properties: {
        weight_kg: {
          type: 'number',
          minimum: BODY_LIMITS.weightKg.min,
          maximum: BODY_LIMITS.weightKg.max,
        },
        date: dayParam,
        message_to_user: opening,
      },
      additionalProperties: false,
    },
  },
}

export const PROPOSE_COMPLETE_PLAN_MEAL_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'propose_complete_plan_meal',
    description:
      'Propõe marcar como feita HOJE uma refeição do plano (ex.: "marca meu almoço"). Use a ref ' +
      '[plano xxxxxx] da lista "Plano de hoje" do CONTEXTO. NÃO grava: o usuário confirma tocando em ' +
      '"Marcar como feita".',
    parameters: {
      type: 'object',
      required: ['plan_meal_ref', 'message_to_user'],
      properties: {
        plan_meal_ref: {
          type: 'string',
          description: 'A ref de 6 caracteres da refeição do plano',
        },
        message_to_user: opening,
      },
      additionalProperties: false,
    },
  },
}

const TOOL_BY_FEATURE: Record<ActionFeature, OpenAI.Chat.ChatCompletionTool> = {
  log_meal: PROPOSE_LOG_MEAL_TOOL,
  log_weight: PROPOSE_LOG_WEIGHT_TOOL,
  complete_plan_meal: PROPOSE_COMPLETE_PLAN_MEAL_TOOL,
}

/** Marcas de ação que o app declarou. */
export function actionFeatures(clientFeatures: string[] | undefined): ActionFeature[] {
  return ACTION_FEATURES.filter((f) => clientFeatures?.includes(f))
}

export function actionTools(features: ActionFeature[]): OpenAI.Chat.ChatCompletionTool[] {
  return features.map((f) => TOOL_BY_FEATURE[f])
}

const CANNOT: Record<ActionFeature | 'delete' | 'swap', { cannot: string; can?: string }> = {
  log_meal: {
    cannot: 'registrar refeição (Diário › Adicionar refeição, ou o Scanner)',
    can: 'propor registrar uma refeição no Diário (propose_log_meal), quando o usuário pedir',
  },
  delete: { cannot: 'apagar um registro (lixeira do registro no Diário)' },
  complete_plan_meal: {
    cannot: 'marcar uma refeição do plano como feita (tela Hoje)',
    can: 'propor marcar uma refeição do plano de hoje como feita (propose_complete_plan_meal)',
  },
  log_weight: {
    cannot: 'registrar o peso (Evolução)',
    can: 'propor registrar o peso na Evolução (propose_log_weight)',
  },
  swap: {
    cannot:
      'trocar um item do plano (o app não tem essa opção: sugira a troca equivalente e diga que a ' +
      'pessoa pode segui-la)',
  },
}
const CANNOT_ORDER = ['log_meal', 'delete', 'complete_plan_meal', 'log_weight', 'swap'] as const

/**
 * 05/11 (M1, agora por marca): o que o coach diz que faz depende do que o app
 * sabe mostrar. Sem nenhuma marca, o texto é o do PR #96.
 */
export function capabilitiesInstruction(features: ActionFeature[] = []): string {
  const has = (k: string) => (features as string[]).includes(k)
  const can = [
    'orientar sobre alimentação',
    'analisar o dia, o plano e os registros do CONTEXTO',
    'propor a correção de um registro do diário (veja a instrução de correção)',
    ...CANNOT_ORDER.filter(has).map((k) => CANNOT[k].can as string),
    'gerar um plano novo, só quando pedido',
  ]
  const cannot = CANNOT_ORDER.filter((k) => !has(k)).map((k) => CANNOT[k].cannot)
  const cards = features.length
    ? ' As ferramentas propose_* NÃO gravam: o app mostra um botão — diga para tocar nele.'
    : ''
  return (
    `O QUE VOCÊ CONSEGUE FAZER: ${can.join('; ')}. O QUE VOCÊ NÃO CONSEGUE FAZER — explique e ` +
    `indique o caminho no app: ${cannot.join('; ')}. NUNCA diga "registrei", "apaguei", "marquei", ` +
    `"atualizei" ou "troquei" sem ter feito isso por uma das suas ferramentas.${cards}`
  )
}

// ─── Propostas ───────────────────────────────────────────────────────────────

export type ActionProposal =
  | {
      kind: 'log_meal'
      name: string
      weightGrams: number
      calories: number
      protein: number
      carbs: number
      fat: number
      fiber: number | null
      mealType: keyof typeof MEAL_TYPE_LABELS
      date: string
    }
  | {
      kind: 'log_weight'
      weightKg: number
      date: string
      replaces: number | null
      bigChange: boolean
    }
  | { kind: 'complete_plan_meal'; mealId: string; title: string; calories: number }

export type ActionResult = { proposal: ActionProposal | null; message: string }

const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',')

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** A frase do modelo só entra se não tiver números (podia contradizer o cartão). */
function withOpening(message: string | undefined, text: string): string {
  return message && !/\d/.test(message) ? `${message.trim()}\n\n${text}` : text
}

const day = (when: 'today' | 'yesterday') => (when === 'today' ? 'hoje' : 'ontem')

const logMealArgs = z.object({
  name: z.string().trim().min(1).max(120),
  weight_grams: z.number().finite().min(0.1).max(5000),
  calories: z.number().finite().min(0),
  protein: z.number().finite().min(0),
  carbs: z.number().finite().min(0),
  fat: z.number().finite().min(0),
  fiber: z.number().finite().min(0).nullable().optional(),
  meal_type: z.enum(['breakfast', 'lunch', 'snack', 'dinner']),
  date: z.enum(['today', 'yesterday']),
  message_to_user: z.string().max(400).optional(),
})

const IMPOSSIBLE_MEAL =
  'Os valores que estimei não fecham com o peso, então não preparei o registro. ' +
  'Pode me dizer a quantidade de novo?'

export function proposeLogMeal(rawArgs: unknown, today: string): ActionResult {
  const parsed = logMealArgs.safeParse(rawArgs)
  if (!parsed.success) return { proposal: null, message: IMPOSSIBLE_MEAL }
  const a = parsed.data
  const values = normalizeMealValues(
    {
      calories: a.calories,
      protein: a.protein,
      carbs: a.carbs,
      fat: a.fat,
      fiber: a.fiber ?? null,
    },
    a.weight_grams,
  )
  if (!values) return { proposal: null, message: IMPOSSIBLE_MEAL }
  const date = a.date === 'today' ? today : shiftDate(today, -1)
  const text =
    `Para registrar no ${MEAL_TYPE_LABELS[a.meal_type]} de ${day(a.date)}: "${a.name}" ` +
    `(${fmt(a.weight_grams)} g) — ${Math.round(values.calories)} kcal · P ${fmt(values.protein)} g · ` +
    `C ${fmt(values.carbs)} g · G ${fmt(values.fat)} g. Toque em Adicionar ao Diário para salvar.`
  return {
    message: withOpening(a.message_to_user, text),
    proposal: {
      kind: 'log_meal',
      name: a.name,
      weightGrams: a.weight_grams,
      mealType: a.meal_type,
      date,
      ...values,
    },
  }
}

const logWeightArgs = z.object({
  weight_kg: z.number().finite().min(BODY_LIMITS.weightKg.min).max(BODY_LIMITS.weightKg.max),
  date: z.enum(['today', 'yesterday']),
  message_to_user: z.string().max(400).optional(),
})

export async function proposeLogWeight(
  fastify: FastifyInstance,
  userId: string,
  rawArgs: unknown,
  today: string,
): Promise<ActionResult> {
  const parsed = logWeightArgs.safeParse(rawArgs)
  if (!parsed.success) {
    return {
      proposal: null,
      message: `Esse peso não parece certo (o app aceita de ${BODY_LIMITS.weightKg.min} a ${BODY_LIMITS.weightKg.max} kg). Pode conferir?`,
    }
  }
  const a = parsed.data
  const date = a.date === 'today' ? today : shiftDate(today, -1)
  const rows = await fastify.db<{ date: string; weight_kg: string | number }[]>`
    SELECT date::TEXT AS date, weight_kg FROM weight_entries
    WHERE user_id = ${userId} AND date <= ${date}
    ORDER BY date DESC LIMIT 2
  `
  const sameDay = rows.find((r) => r.date === date)
  const previous = rows.find((r) => r.date !== date)
  const replaces = sameDay ? Number(sameDay.weight_kg) : null
  const reference = previous ? Number(previous.weight_kg) : null
  const bigChange = reference != null && Math.abs(a.weight_kg - reference) > WEIGHT_BIG_CHANGE_KG
  const parts = [`Para registrar na Evolução: ${fmt(a.weight_kg)} kg ${day(a.date)}.`]
  if (replaces != null) parts.push(`Substitui o peso de ${day(a.date)} (${fmt(replaces)} kg).`)
  if (bigChange && reference != null)
    parts.push(
      `Confira: é ${fmt(Math.abs(a.weight_kg - reference))} kg diferente do último registro (${fmt(reference)} kg).`,
    )
  parts.push('Toque em Registrar na Evolução para salvar.')
  return {
    message: withOpening(a.message_to_user, parts.join(' ')),
    proposal: { kind: 'log_weight', weightKg: a.weight_kg, date, replaces, bigChange },
  }
}

const completeArgs = z.object({
  plan_meal_ref: z.string().trim().min(1).max(40),
  message_to_user: z.string().max(400).optional(),
})

export function proposeCompletePlanMeal(rawArgs: unknown, today: TodayPlan | null): ActionResult {
  const parsed = completeArgs.safeParse(rawArgs)
  const ref = parsed.success
    ? parsed.data.plan_meal_ref.replace(/^plano\s*/i, '').toLowerCase()
    : ''
  const meal = today?.meals.find((m) => mealRef(m.id) === ref)
  if (!parsed.success || !meal) {
    return {
      proposal: null,
      message: 'Não achei essa refeição no seu plano de hoje. Você pode marcá-la na tela Hoje.',
    }
  }
  if (meal.completedToday)
    return { proposal: null, message: `"${meal.title}" já está marcada como feita hoje.` }
  const text = `Para marcar "${meal.title}" (${Math.round(meal.calories)} kcal) como feita hoje, toque em Marcar como feita.`
  return {
    message: withOpening(parsed.data.message_to_user, text),
    proposal: {
      kind: 'complete_plan_meal',
      mealId: meal.id,
      title: meal.title,
      calories: Math.round(meal.calories),
    },
  }
}
