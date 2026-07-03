import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import {
  aiSingleDaySchema,
  collectedUserDataSchema,
  type AiSingleDay,
  type CollectedUserData,
} from '../../shared/diet-ai-schema.js'
import { createSystemPost } from '../feed/feed.service.js'

const TOTAL_DAYS = 5
const DAYS_PT = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

export interface JobStatus {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  daysCompleted: number
  totalDays: number
  dietId: string | null
}

interface DietTargets {
  tdee: number
  targetCalories: number
  protein: number
  carbs: number
  fat: number
}

// ─── Metas determinísticas (Mifflin-St Jeor) ─────────────────────────────────

function computeTargets(u: CollectedUserData): DietTargets {
  const base = 10 * u.weight_kg + 6.25 * u.height_cm - 5 * u.age
  const bmr = u.gender === 'male' ? base + 5 : u.gender === 'female' ? base - 161 : base - 78
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }[
    u.activity_level
  ]
  const tdee = bmr * factor
  const adjust = { lose_weight: -500, maintain: 0, gain_muscle: 300, gain_weight: 500 }[u.goal] ?? 0
  const targetCalories = Math.max(1000, Math.round(tdee + adjust))
  const protein = Math.round((u.goal === 'gain_muscle' ? 2.0 : 1.8) * u.weight_kg)
  const fat = Math.round((targetCalories * 0.25) / 9)
  const carbs = Math.max(0, Math.round((targetCalories - protein * 4 - fat * 9) / 4))
  return { tdee: Math.round(tdee), targetCalories, protein, carbs, fat }
}

/**
 * jsonb pode voltar como string (às vezes duplamente serializada) dependendo do
 * driver/pooler — mesmo caso do chat_history. Faz parse defensivo (sem estourar)
 * e valida o shape; retorna null se não der pra recuperar os dados.
 */
function parseInput(raw: unknown): CollectedUserData | null {
  let value: unknown = raw
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const result = collectedUserDataSchema.safeParse(value)
  return result.success ? result.data : null
}

// ─── Criação do job ───────────────────────────────────────────────────────────

/**
 * Cria o job de geração e o cabeçalho da dieta (metas determinísticas), sem
 * gerar os dias ainda. Arquiva a dieta ativa anterior. Retorna o jobId.
 */
export async function createDietJob(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  userData: CollectedUserData,
): Promise<{ jobId: string; dietId: string }> {
  const t = computeTargets(userData)
  const dietId = randomUUID()
  const jobId = randomUUID()
  const inputJson = JSON.stringify(userData)

  await fastify.db.begin(async (sql) => {
    await sql`
      UPDATE diets SET status = 'replaced', updated_at = NOW()
      WHERE user_id = ${userId} AND status = 'active'
    `
    await sql`
      INSERT INTO diets (
        id, user_id, conversation_id, name, description,
        user_weight_kg, user_height_cm, user_age, user_gender, user_goal, user_activity_level,
        tdee_calories, target_calories, target_protein_g, target_carbs_g, target_fat_g,
        status, ai_model
      ) VALUES (
        ${dietId}, ${userId}, ${conversationId}, 'Plano personalizado', 'Gerado pelo Coach IA',
        ${userData.weight_kg}, ${userData.height_cm}, ${userData.age},
        ${userData.gender}, ${userData.goal}, ${userData.activity_level},
        ${t.tdee}, ${t.targetCalories}, ${t.protein}, ${t.carbs}, ${t.fat},
        'active', ${env.OPENAI_MODEL}
      )
    `
    await sql`
      INSERT INTO diet_jobs (id, user_id, conversation_id, diet_id, status, input, total_days, days_completed)
      VALUES (${jobId}, ${userId}, ${conversationId}, ${dietId}, 'pending', ${inputJson}::jsonb, ${TOTAL_DAYS}, 0)
    `
  })

  return { jobId, dietId }
}

// ─── Geração de 1 dia (1 chamada GPT-5, cabe no limite serverless) ───────────

const DAY_SYSTEM_PROMPT =
  'Você é um nutricionista. Gere UM dia de plano alimentar em JSON, com alimentos ' +
  'brasileiros comuns e acessíveis, respeitando as metas e restrições informadas. ' +
  'Some as calorias/macros dos itens de forma coerente com a meta diária.'

function buildDayPrompt(u: CollectedUserData, t: DietTargets, dayNumber: number): string {
  const goalLabels: Record<string, string> = {
    lose_weight: 'perda de peso',
    maintain: 'manutenção',
    gain_muscle: 'ganho de massa',
    gain_weight: 'ganho de peso',
  }
  return `Gere o dia ${dayNumber} de ${TOTAL_DAYS} (${DAYS_PT[dayNumber] ?? `Dia ${dayNumber}`}) de um plano alimentar.

Perfil: ${u.weight_kg}kg, ${u.height_cm}cm, ${u.age} anos, ${u.gender}, objetivo ${goalLabels[u.goal] ?? u.goal}.
Metas do DIA: ${t.targetCalories} kcal, ${t.protein}g proteína, ${t.carbs}g carboidrato, ${t.fat}g gordura.
Refeições por dia: ${u.meals_per_day}.
${u.dietary_restrictions?.length ? `Restrições: ${u.dietary_restrictions.join(', ')}.` : ''}
${u.allergies?.length ? `Alergias (EVITAR): ${u.allergies.join(', ')}.` : ''}
${u.food_preferences ? `Preferências: ${u.food_preferences}.` : ''}

Regras: varie os alimentos (evite repetir em relação a um dia típico), especifique quantidade em gramas e calorias/macros por item. Distribua as ${u.meals_per_day} refeições ao longo do dia.`
}

function dayTotals(day: AiSingleDay) {
  let cal = 0
  let p = 0
  let c = 0
  let f = 0
  for (const meal of day.meals) {
    for (const it of meal.items) {
      cal += it.calories
      p += it.protein_g
      c += it.carbs_g
      f += it.fat_g
    }
  }
  return { cal: Math.round(cal), p: Math.round(p), c: Math.round(c), f: Math.round(f) }
}

interface JobRow {
  id: string
  conversation_id: string | null
  diet_id: string
  status: JobStatus['status']
  input: unknown
  total_days: number
  days_completed: number
}

function toStatus(job: JobRow): JobStatus {
  return {
    jobId: job.id,
    status: job.status,
    daysCompleted: job.days_completed,
    totalDays: job.total_days,
    dietId: job.diet_id,
  }
}

async function loadJob(
  fastify: FastifyInstance,
  userId: string,
  jobId: string,
): Promise<JobRow> {
  const [job] = await fastify.db<JobRow[]>`
    SELECT id, conversation_id, diet_id, status, input, total_days, days_completed
    FROM diet_jobs WHERE id = ${jobId} AND user_id = ${userId}
  `
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job de geração não encontrado')
  return job
}

export async function getJob(
  fastify: FastifyInstance,
  userId: string,
  jobId: string,
): Promise<JobStatus> {
  return toStatus(await loadJob(fastify, userId, jobId))
}

/**
 * Gera e persiste o PRÓXIMO dia do job. Cada chamada = 1 dia = 1 chamada GPT-5.
 * O cliente chama repetidamente (polling) até status 'completed'.
 */
export async function processJobStep(
  fastify: FastifyInstance,
  userId: string,
  jobId: string,
): Promise<JobStatus> {
  const job = await loadJob(fastify, userId, jobId)
  if (job.status === 'completed' || job.status === 'failed') return toStatus(job)

  const dayNumber = job.days_completed + 1
  if (dayNumber > job.total_days) {
    await fastify.db`UPDATE diet_jobs SET status = 'completed', updated_at = NOW() WHERE id = ${jobId}`
    return { ...toStatus(job), status: 'completed' }
  }

  const userData = parseInput(job.input)
  if (!userData) {
    fastify.log.error({ jobId, input: job.input }, 'Dados do job inválidos/irrecuperáveis')
    await fastify.db`UPDATE diet_jobs SET status = 'failed', error = 'invalid_input', updated_at = NOW() WHERE id = ${jobId}`
    throw new AppError(422, 'INVALID_JOB_INPUT', 'Dados da geração inválidos. Refaça a conversa com o coach.')
  }
  const targets = computeTargets(userData)

  // 1) Gera o dia (chamada longa — SEM segurar transação/lock).
  let aiDay: AiSingleDay
  try {
    const completion = await fastify.openai.beta.chat.completions.parse({
      model: env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: DAY_SYSTEM_PROMPT },
        { role: 'user', content: buildDayPrompt(userData, targets, dayNumber) },
      ],
      response_format: zodResponseFormat(aiSingleDaySchema, 'diet_day'),
      max_tokens: 6000,
      // Reasoning baixo pra caber no limite serverless por dia.
      reasoning_effort: 'low',
    })
    const parsed = completion.choices[0]?.message?.parsed
    if (!parsed) throw new Error('IA retornou dia vazio')
    aiDay = parsed
  } catch (err) {
    fastify.log.error({ err, jobId, dayNumber }, 'Falha ao gerar dia da dieta')
    await fastify.db`
      UPDATE diet_jobs SET status = 'failed', error = ${String(err).slice(0, 300)}, updated_at = NOW()
      WHERE id = ${jobId}
    `
    throw new AppError(502, 'DIET_STEP_FAILED', 'Falha ao gerar um dia da dieta. Tente novamente.')
  }

  // 2) Persiste o dia + incrementa com concorrência otimista (tx curta).
  const totals = dayTotals(aiDay)
  try {
    await fastify.db.begin(async (sql) => {
      const dayId = randomUUID()
      await sql`
        INSERT INTO diet_days (id, diet_id, day_number, day_name, total_calories, total_protein, total_carbs, total_fat)
        VALUES (${dayId}, ${job.diet_id}, ${dayNumber}, ${DAYS_PT[dayNumber] ?? `Dia ${dayNumber}`},
                ${totals.cal}, ${totals.p}, ${totals.c}, ${totals.f})
      `
      for (let mi = 0; mi < aiDay.meals.length; mi++) {
        const meal = aiDay.meals[mi]
        const mealId = randomUUID()
        await sql`
          INSERT INTO diet_meals (id, diet_day_id, meal_type, name, time_suggestion,
                                  total_calories, total_protein, total_carbs, total_fat, sort_order)
          VALUES (${mealId}, ${dayId}, ${meal.meal_type}, ${meal.name}, ${meal.time_suggestion},
                  ${meal.total_calories},
                  ${meal.items.reduce((s, i) => s + i.protein_g, 0)},
                  ${meal.items.reduce((s, i) => s + i.carbs_g, 0)},
                  ${meal.items.reduce((s, i) => s + i.fat_g, 0)}, ${mi})
        `
        for (let ii = 0; ii < meal.items.length; ii++) {
          const it = meal.items[ii]
          await sql`
            INSERT INTO diet_items (id, diet_meal_id, food_name, quantity_g, unit,
                                    calories, protein_g, carbs_g, fat_g, preparation_tip, sort_order)
            VALUES (${randomUUID()}, ${mealId}, ${it.food_name}, ${it.quantity_g}, ${it.unit},
                    ${it.calories}, ${it.protein_g}, ${it.carbs_g}, ${it.fat_g}, ${it.preparation_tip}, ${ii})
          `
        }
      }
      const res = await sql`
        UPDATE diet_jobs SET days_completed = ${dayNumber}, status = 'running', updated_at = NOW()
        WHERE id = ${jobId} AND days_completed = ${dayNumber - 1}
      `
      if (res.count === 0) throw new Error('CONCURRENT_STEP')
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'CONCURRENT_STEP') {
      // Outra chamada avançou este dia; retorna o estado atual.
      return toStatus(await loadJob(fastify, userId, jobId))
    }
    throw err
  }

  // 3) Finaliza se foi o último dia.
  const done = dayNumber >= job.total_days
  if (done) {
    await fastify.db`UPDATE diet_jobs SET status = 'completed', updated_at = NOW() WHERE id = ${jobId}`
    if (job.conversation_id) {
      try {
        await fastify.db`
          UPDATE chat_history SET status = 'completed', diet_id = ${job.diet_id}, updated_at = NOW()
          WHERE id = ${job.conversation_id}
        `
      } catch (err) {
        fastify.log.warn(err, 'Falha ao marcar chat_history como completed')
      }
    }
    try {
      await createSystemPost(fastify, userId, 'diet_generated', 'Nova dieta gerada com o Coach IA! 🥗', {
        diet_id: job.diet_id,
      })
    } catch (err) {
      fastify.log.warn(err, 'Falha ao publicar post de dieta gerada')
    }
  }

  return {
    jobId,
    status: done ? 'completed' : 'running',
    daysCompleted: dayNumber,
    totalDays: job.total_days,
    dietId: job.diet_id,
  }
}
