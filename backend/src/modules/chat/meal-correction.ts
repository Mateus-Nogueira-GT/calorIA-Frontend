import type { FastifyInstance } from 'fastify'
import type OpenAI from 'openai'
import { z } from 'zod'
import { isImplausibleMeal } from '../food-log/food-log.schemas.js'
import { listMeals, updateMeal } from '../food-log/food-log.service.js'
import { mealRef } from './chat-context.js'

/**
 * Feedback de 04/11: o scanner registrou "carne suína" num jantar de salmão e o
 * usuário queria que o coach corrigisse "no mesmo peso". O coach vê os
 * registros com uma ref curta (chat-context) e, depois que o usuário
 * confirma, chama esta tool. O peso nunca muda; os valores passam pelas mesmas
 * regras do registro manual.
 */
export const UPDATE_LOGGED_MEAL_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_logged_meal',
    description:
      'Corrige um registro do diário dos últimos 7 dias (ex.: o scanner identificou o alimento errado). ' +
      'Chame APENAS depois que o usuário CONFIRMAR a correção que você propôs. Os valores são para o ' +
      'MESMO PESO do registro (o peso não muda).',
    parameters: {
      type: 'object',
      required: [
        'meal_ref',
        'name',
        'calories',
        'protein',
        'carbs',
        'fat',
        'fiber',
        'message_to_user',
      ],
      properties: {
        meal_ref: {
          type: 'string',
          description: 'A ref de 6 caracteres do registro, da lista do contexto',
        },
        name: { type: 'string', maxLength: 120, description: 'Nome correto do alimento' },
        calories: { type: 'number', minimum: 0, description: 'kcal para o mesmo peso' },
        protein: { type: 'number', minimum: 0, description: 'proteína (g) para o mesmo peso' },
        carbs: { type: 'number', minimum: 0, description: 'carboidratos (g) para o mesmo peso' },
        fat: { type: 'number', minimum: 0, description: 'gordura (g) para o mesmo peso' },
        fiber: {
          type: ['number', 'null'],
          minimum: 0,
          description: 'fibra (g); null se não souber',
        },
        message_to_user: {
          type: 'string',
          maxLength: 400,
          description: 'Confirmação curta para o usuário do que foi corrigido',
        },
      },
      additionalProperties: false,
    },
  },
}

/**
 * 05/11 (M3): a tool de 04/11 gravava assim que o modelo decidia — a
 * confirmação dependia só de ele obedecer à instrução. Esta só PROPÕE: o app
 * mostra um cartão com os valores e grava quando o usuário toca no botão. Só
 * é oferecida ao app que declara `client_features: ['meal_proposal']`.
 */
export const PROPOSE_MEAL_CORRECTION_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    ...UPDATE_LOGGED_MEAL_TOOL.function,
    name: 'propose_meal_correction',
    description:
      'Propõe a correção de um registro do diário dos últimos 7 dias (ex.: o scanner identificou o ' +
      'alimento errado). NÃO grava: o app mostra os valores e o usuário confirma tocando em ' +
      '"Atualizar registro". Os valores são para o MESMO PESO do registro (o peso não muda).',
    parameters: {
      ...(UPDATE_LOGGED_MEAL_TOOL.function.parameters as Record<string, unknown>),
      properties: {
        ...(UPDATE_LOGGED_MEAL_TOOL.function.parameters as { properties: object }).properties,
        message_to_user: {
          type: 'string',
          maxLength: 200,
          description: 'Frase curta de abertura, SEM números (o app mostra os valores)',
        },
      },
    },
  },
}

export const MEAL_PROPOSAL_INSTRUCTION =
  'INSTRUÇÃO: se o usuário disser que um registro está errado (ex.: "não era carne suína, era salmão"), ' +
  'chame propose_meal_correction JÁ NESTA resposta, com os valores do alimento certo PARA O MESMO PESO ' +
  'do registro. Não pergunte "posso atualizar?": o app mostra um botão para o usuário confirmar. ' +
  'Use a ref da lista do CONTEXTO ou a que o usuário citar na mensagem (registros de outros dias).'

export const MEAL_CORRECTION_INSTRUCTION =
  'INSTRUÇÃO: se o usuário disser que um registro está errado (ex.: "não era carne suína, era salmão"), ' +
  'use o peso desse registro na lista, responda com os valores do alimento certo PARA O MESMO PESO e ' +
  'pergunte se pode atualizar o registro. Só chame update_logged_meal depois que ele confirmar.'

const argsSchema = z.object({
  meal_ref: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  calories: z.number().finite().min(0),
  protein: z.number().finite().min(0),
  carbs: z.number().finite().min(0),
  fat: z.number().finite().min(0),
  fiber: z.number().finite().min(0).nullable().optional(),
  message_to_user: z.string().trim().max(400).optional(),
})

/** Mesma tolerância das verificações do dia da dieta (guardrails/day.ts). */
const KCAL_MISMATCH_TOLERANCE = 0.25
const MACROS_WEIGHT_TOLERANCE = 1.05
/** 05/11 (M6): hoje e os 6 dias anteriores (era hoje e ontem). */
const CORRECTION_WINDOW_DAYS = 7

const NOT_FOUND =
  'Não encontrei esse registro entre os dos últimos 7 dias, então não alterei nada. ' +
  'Você pode corrigir pelo Diário, tocando no registro.'
const IMPOSSIBLE =
  'Os valores que calculei não fecham com o peso do registro, então não alterei nada. ' +
  'Pode me confirmar o alimento e o peso?'

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type LoggedMeal = Awaited<ReturnType<typeof listMeals>>[number]
type CorrectionValues = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

type ResolvedCorrection =
  | {
      ok: true
      meal: LoggedMeal
      date: string
      name: string
      values: CorrectionValues
      message?: string
    }
  | { ok: false; message: string }

/** Acha o registro pela ref e valida/normaliza os valores. Não grava nada. */
async function resolveCorrection(
  fastify: FastifyInstance,
  userId: string,
  rawArgs: unknown,
  today: string,
): Promise<ResolvedCorrection> {
  const parsed = argsSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, message: IMPOSSIBLE }
  const args = parsed.data
  const ref = args.meal_ref.replace(/^ref\s*/i, '').toLowerCase()

  const dates = Array.from({ length: CORRECTION_WINDOW_DAYS }, (_, i) => shiftDate(today, -i))
  const byDay = await Promise.all(dates.map((date) => listMeals(fastify, userId, date)))
  const candidates = byDay.flatMap((meals, i) =>
    meals.filter((meal) => mealRef(meal.id) === ref).map((meal) => ({ date: dates[i], meal })),
  )
  if (candidates.length !== 1) return { ok: false, message: NOT_FOUND }
  const { date, meal } = candidates[0]

  const values: CorrectionValues = {
    calories: args.calories,
    protein: args.protein,
    carbs: args.carbs,
    fat: args.fat,
    fiber: args.fiber ?? null,
  }
  const macroGrams = values.protein + values.carbs + values.fat
  if (
    isImplausibleMeal(values) ||
    (meal.weightGrams != null && macroGrams > meal.weightGrams * MACROS_WEIGHT_TOLERANCE)
  ) {
    return { ok: false, message: IMPOSSIBLE }
  }
  // Os macros são a informação primária; a kcal do modelo erra a soma com frequência.
  const expected = 4 * values.protein + 4 * values.carbs + 9 * values.fat
  if (
    expected > 0 &&
    Math.abs(values.calories - expected) / Math.max(values.calories, 1) > KCAL_MISMATCH_TOLERANCE
  ) {
    values.calories = Math.round(expected)
  }
  return { ok: true, meal, date, name: args.name, values, message: args.message_to_user }
}

export type MealCorrectionResult =
  | { ok: true; mealId: string; date: string; message: string }
  | { ok: false; message: string }

/** Tool de 04/11 (apps sem o cartão de proposta): grava direto. */
export async function applyMealCorrection(
  fastify: FastifyInstance,
  userId: string,
  rawArgs: unknown,
  today: string,
): Promise<MealCorrectionResult> {
  const r = await resolveCorrection(fastify, userId, rawArgs, today)
  if (!r.ok) return r
  await updateMeal(fastify, userId, r.meal.id, {
    name: r.name,
    ...r.values,
    mealType: r.meal.mealType,
  })
  fastify.log.info({ userId, mealId: r.meal.id }, 'Registro corrigido pelo coach')
  return {
    ok: true,
    mealId: r.meal.id,
    date: r.date,
    message: r.message || `Pronto, atualizei o registro para "${r.name}".`,
  }
}

export interface MealProposal extends CorrectionValues {
  id: string
  date: string
  currentName: string
  name: string
  weightGrams: number | null
  mealType: LoggedMeal['mealType']
}

export type MealProposalResult =
  | { ok: true; proposal: MealProposal; message: string }
  | { ok: false; message: string }

const fmt = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',')

/**
 * Proposta de correção (05/11, M3). O texto com os números é do servidor,
 * montado com os mesmos valores do cartão — a mensagem do modelo citava uma
 * kcal que o servidor depois recalculava (M4). A frase do modelo só entra se
 * não tiver números.
 */
export async function proposeMealCorrection(
  fastify: FastifyInstance,
  userId: string,
  rawArgs: unknown,
  today: string,
): Promise<MealProposalResult> {
  const r = await resolveCorrection(fastify, userId, rawArgs, today)
  if (!r.ok) return r
  const v = r.values
  const weight = r.meal.weightGrams != null ? `os mesmos ${fmt(r.meal.weightGrams)} g de ` : ''
  const summary =
    `Para ${weight}"${r.name}": ${Math.round(v.calories)} kcal · P ${fmt(v.protein)} g · ` +
    `C ${fmt(v.carbs)} g · G ${fmt(v.fat)} g. Toque em Atualizar registro para salvar.`
  const opening = r.message && !/\d/.test(r.message) ? `${r.message}\n\n` : ''
  fastify.log.info({ userId, mealId: r.meal.id }, 'Correção proposta pelo coach')
  return {
    ok: true,
    message: `${opening}${summary}`,
    proposal: {
      id: r.meal.id,
      date: r.date,
      currentName: r.meal.name,
      name: r.name,
      weightGrams: r.meal.weightGrams ?? null,
      mealType: r.meal.mealType,
      ...v,
    },
  }
}
