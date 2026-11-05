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
      'Corrige um registro do diário de hoje ou de ontem (ex.: o scanner identificou o alimento errado). ' +
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
  message_to_user: z.string().trim().min(1).max(400),
})

/** Mesma tolerância das verificações do dia da dieta (guardrails/day.ts). */
const KCAL_MISMATCH_TOLERANCE = 0.25
const MACROS_WEIGHT_TOLERANCE = 1.05

const NOT_FOUND =
  'Não encontrei esse registro entre os de hoje e de ontem, então não alterei nada. ' +
  'Você pode corrigir pelo Diário, tocando em Editar.'
const IMPOSSIBLE =
  'Os valores que calculei não fecham com o peso do registro, então não alterei nada. ' +
  'Pode me confirmar o alimento e o peso?'

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export type MealCorrectionResult =
  | { ok: true; mealId: string; date: string; message: string }
  | { ok: false; message: string }

export async function applyMealCorrection(
  fastify: FastifyInstance,
  userId: string,
  rawArgs: unknown,
  today: string,
): Promise<MealCorrectionResult> {
  const parsed = argsSchema.safeParse(rawArgs)
  if (!parsed.success) return { ok: false, message: IMPOSSIBLE }
  const args = parsed.data
  const ref = args.meal_ref.replace(/^ref\s*/i, '').toLowerCase()

  // Só hoje e ontem: é o que o contexto mostra, e correção de semana passada é do Diário.
  const candidates: { date: string; meal: Awaited<ReturnType<typeof listMeals>>[number] }[] = []
  for (const date of [today, previousDay(today)]) {
    for (const meal of await listMeals(fastify, userId, date)) {
      if (mealRef(meal.id) === ref) candidates.push({ date, meal })
    }
  }
  if (candidates.length !== 1) return { ok: false, message: NOT_FOUND }
  const { date, meal } = candidates[0]

  const values = {
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

  await updateMeal(fastify, userId, meal.id, {
    name: args.name,
    ...values,
    mealType: meal.mealType,
  })
  fastify.log.info({ userId, mealId: meal.id }, 'Registro corrigido pelo coach')
  return { ok: true, mealId: meal.id, date, message: args.message_to_user }
}
