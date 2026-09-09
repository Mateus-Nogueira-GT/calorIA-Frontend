import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { zodResponseFormat } from 'openai/helpers/zod.js'
import { buildModelsField, logAiUsage } from '../../shared/ai-usage.js'
import {
  type AiSingleDay,
  type CollectedUserData,
  aiSingleDaySchema,
  collectedUserDataSchema,
} from '../../shared/diet-ai-schema.js'
import { env } from '../../shared/env.js'
import { AppError } from '../../shared/errors.js'
import { mealTypesFor, reconcileDay } from '../../shared/guardrails/day.js'
import { type DayGuardrailResult, applyDayGuardrails } from '../../shared/guardrails/index.js'
import { createSystemPost } from '../feed/feed.service.js'

// Reexport: reconcileDay migrou para shared/guardrails/day.ts (guardrails de
// saída do dia gerado); mantido aqui para não quebrar quem já importa daqui.
export { reconcileDay }

// B1 da spec: 7 dias — sábado/domingo ficavam sem plano com 5.
const TOTAL_DAYS = 7
const DAYS_PT = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

// S5: piso mínimo sem supervisão profissional. 1000 (antes) fica abaixo do
// que qualquer diretriz recomenda; abaixo do piso o plano vira risco.
export const MIN_CALORIES_FEMALE = 1200
export const MIN_CALORIES_OTHER = 1500

export interface JobStatus {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  daysCompleted: number
  totalDays: number
  dietId: string | null
  error: string | null
}

interface DietTargets {
  tdee: number
  targetCalories: number
  protein: number
  carbs: number
  fat: number
}

// ─── Metas determinísticas (Mifflin-St Jeor) ─────────────────────────────────

export function computeTargets(u: CollectedUserData): DietTargets {
  const base = 10 * u.weight_kg + 6.25 * u.height_cm - 5 * u.age
  const bmr = u.gender === 'male' ? base + 5 : u.gender === 'female' ? base - 161 : base - 78
  const factor = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }[
    u.activity_level
  ]
  const tdee = bmr * factor
  const adjust = { lose_weight: -500, maintain: 0, gain_muscle: 300, gain_weight: 500 }[u.goal] ?? 0
  const floor = u.gender === 'female' ? MIN_CALORIES_FEMALE : MIN_CALORIES_OTHER
  const targetCalories = Math.max(floor, Math.round(tdee + adjust))
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
export function parseInput(raw: unknown): CollectedUserData | null {
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
 * Job de geração em andamento (pending/running) mais recente do usuário, ou
 * null. Usado por createDietJob (não abrir duas gerações) e pelo chat (C1:
 * não oferecer a tool ao modelo enquanto há geração em voo).
 */
export async function getPendingJob(
  fastify: FastifyInstance,
  userId: string,
): Promise<{ id: string; diet_id: string } | null> {
  const [row] = await fastify.db<{ id: string; diet_id: string }[]>`
    SELECT id, diet_id
    FROM diet_jobs
    WHERE user_id = ${userId} AND status IN ('pending', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ?? null
}

/**
 * Cria o job de geração e o cabeçalho da dieta (metas determinísticas), sem
 * gerar os dias ainda. A dieta nasce como RASCUNHO (draft) — a ativa anterior
 * só é substituída quando o último dia é gerado (B3 da spec). Se a geração
 * falhar, o usuário mantém a dieta antiga intacta.
 */
export async function createDietJob(
  fastify: FastifyInstance,
  userId: string,
  conversationId: string,
  userData: CollectedUserData,
): Promise<{ jobId: string; dietId: string }> {
  // Reaproveita uma geração em andamento em vez de abrir outra.
  //
  // O chat chama esta função toda vez que a IA usa a tool collect_diet_data, e
  // a instrução de "dados já conhecidos" manda a IA chamar a tool sempre que o
  // usuário CONFIRMA os dados. Depois que a dieta existe, qualquer "ok" ou
  // "obrigado" era lido como confirmação: cada mensagem criava uma dieta nova,
  // e o usuário via a lista ser gerada de novo sem parar.
  //
  // Este guard é a rede determinística — mesmo que o prompt falhe, não dá para
  // ter duas gerações concorrentes do mesmo usuário. A instrução de prompt
  // (EXISTING_DIET_INSTRUCTION, no chat.service) evita a tentativa antes daqui.
  const emAndamento = await getPendingJob(fastify, userId)
  if (emAndamento) {
    fastify.log.info(
      { userId, jobId: emAndamento.id },
      'Geração de dieta já em andamento — reaproveitando o job',
    )
    return { jobId: emAndamento.id, dietId: emAndamento.diet_id }
  }

  const t = computeTargets(userData)
  const dietId = randomUUID()
  const jobId = randomUUID()
  const inputJson = JSON.stringify(userData)

  await fastify.db.begin(async (sql) => {
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
        'draft', ${env.OPENAI_DIET_MODEL}
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

// O5: explicita meal_type/ordem e reforça alergia como proibição — o prompt
// anterior só dizia "restrições informadas", o que deixava a IA livre para
// escolher quantas/quais refeições gerar e tratar alergia como preferência.
const DAY_SYSTEM_PROMPT =
  'Você é um nutricionista. Gere UM dia de plano alimentar em JSON, com alimentos ' +
  'brasileiros comuns e acessíveis, respeitando as metas e restrições informadas. ' +
  'Some as calorias/macros dos itens de forma coerente com a meta diária (kcal de cada ' +
  'item = 4×proteína + 4×carboidrato + 9×gordura). Use EXATAMENTE os meal_type pedidos, ' +
  'na ordem pedida, sem repetir. Alergias são PROIBIÇÕES absolutas, inclusive em ' +
  'ingredientes e dicas de preparo.'

// ─── Variedade entre dias (I3) ────────────────────────────────────────────────

const PREV_DAYS_MAX_FOODS = 8
const PREV_DAYS_MAX_CHARS = 600

/**
 * Resume os alimentos dos dias já gerados para o prompt do próximo dia — sem
 * isso cada `/step` gera às cegas e "varie os alimentos" é impossível de
 * obedecer (frango 5 dias seguidos). Até 8 alimentos por dia, teto de 600 chars.
 */
export function summarizePreviousDays(rows: { day_name: string; foods: string[] }[]): string {
  if (rows.length === 0) return ''
  const lines: string[] = []
  let used = 0
  for (const row of rows) {
    const foods = row.foods.slice(0, PREV_DAYS_MAX_FOODS).join(', ')
    const line = `${row.day_name}: ${foods}`
    if (used + line.length + 1 > PREV_DAYS_MAX_CHARS) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

// Exportada: o snapshot do prompt (task 10) e o loop de regeneração com
// feedback (task 11) precisam chamar isso de fora deste módulo.
export function buildDayPrompt(
  u: CollectedUserData,
  t: DietTargets,
  dayNumber: number,
  previousDays = '',
  feedback = '',
): string {
  const goalLabels: Record<string, string> = {
    lose_weight: 'perda de peso',
    maintain: 'manutenção',
    gain_muscle: 'ganho de massa',
    gain_weight: 'ganho de peso',
  }
  // Mesma fonte que o validador (validateDay) usa para checar ordem/tipo —
  // se o prompt derivasse a lista por conta própria, prompt e validador
  // poderiam divergir sobre o que é "um dia de 4 refeições", e o dia gerado
  // falharia a validação por um motivo que a IA nunca recebeu.
  const mealTypes = mealTypesFor(u.meals_per_day)
  const varietySection = previousDays
    ? `\nDIAS JÁ GERADOS — para garantir variedade, evite repetir a mesma proteína principal do almoço/jantar em dias consecutivos e varie os carboidratos:\n${previousDays}\n`
    : ''
  // Só existe quando uma tentativa anterior foi rejeitada pelos guardrails
  // (task 11 monta essa string); sem isso a seção não aparece no prompt.
  const feedbackSection = feedback ? `\n${feedback}\n` : ''
  return `Gere o dia ${dayNumber} de ${TOTAL_DAYS} (${DAYS_PT[dayNumber] ?? `Dia ${dayNumber}`}) de um plano alimentar.

Perfil: ${u.weight_kg}kg, ${u.height_cm}cm, ${u.age} anos, ${u.gender}, objetivo ${goalLabels[u.goal] ?? u.goal}.
Metas do DIA: ${t.targetCalories} kcal, ${t.protein}g proteína, ${t.carbs}g carboidrato, ${t.fat}g gordura.
Refeições: exatamente ${mealTypes.length} refeições, com estes meal_type nesta ordem: ${mealTypes.join(', ')}.
${u.dietary_restrictions?.length ? `Restrições alimentares (PROIBIDO qualquer ingrediente incompatível, inclusive em dicas de preparo): ${u.dietary_restrictions.join(', ')}. Ex.: vegetariano = sem carne nem peixe; sem glúten = sem trigo, pão ou massa comum.` : ''}
${u.allergies?.length ? `Alergias (PROIBIDO, em qualquer ingrediente ou dica): ${u.allergies.join(', ')}.` : ''}
${u.food_preferences ? `Preferências: ${u.food_preferences}.` : ''}
${varietySection}${feedbackSection}
Regras: varie os alimentos (evite repetir em relação a um dia típico), especifique quantidade em gramas e calorias/macros por item. Distribua as ${mealTypes.length} refeições ao longo do dia.`
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
  error: string | null
}

function toStatus(job: JobRow): JobStatus {
  return {
    jobId: job.id,
    status: job.status,
    daysCompleted: job.days_completed,
    totalDays: job.total_days,
    dietId: job.diet_id,
    error: job.error,
  }
}

async function loadJob(fastify: FastifyInstance, userId: string, jobId: string): Promise<JobRow> {
  const [job] = await fastify.db<JobRow[]>`
    SELECT id, conversation_id, diet_id, status, input, total_days, days_completed, error
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
 * Reabre um job que falhou (B5 da spec): volta para 'running' mantendo
 * days_completed — o próximo /step continua do dia seguinte, sem regenerar
 * os dias já persistidos. Idempotente: job não-failed retorna o estado atual.
 */
export async function retryJob(
  fastify: FastifyInstance,
  userId: string,
  jobId: string,
): Promise<JobStatus> {
  const job = await loadJob(fastify, userId, jobId)
  if (job.status !== 'failed') return toStatus(job)

  await fastify.db.begin(async (sql) => {
    await sql`
      UPDATE diet_jobs SET status = 'running', error = NULL, updated_at = NOW()
      WHERE id = ${jobId}
    `
    await sql`
      UPDATE diets SET status = 'draft', updated_at = NOW()
      WHERE id = ${job.diet_id} AND status = 'failed'
    `
  })

  return { ...toStatus(job), status: 'running', error: null }
}

/**
 * Job de geração em andamento (pending/running) mais recente do usuário.
 * Usado pelo app no boot para RETOMAR o polling de uma geração interrompida
 * (app fechado no meio) — sem isso a dieta ficava parcial para sempre.
 */
export async function getActiveJob(fastify: FastifyInstance, userId: string): Promise<JobStatus> {
  const [job] = await fastify.db<JobRow[]>`
    SELECT id, conversation_id, diet_id, status, input, total_days, days_completed, error
    FROM diet_jobs
    WHERE user_id = ${userId} AND status IN ('pending', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `
  if (!job) throw new AppError(404, 'NO_ACTIVE_JOB', 'Nenhuma geração de dieta em andamento')
  return toStatus(job)
}

/** O4: uma regeneração com feedback; na segunda falha o job vai para failed. */
const MAX_DAY_ATTEMPTS = 2

async function generateDay(
  fastify: FastifyInstance,
  userId: string,
  dayNumber: number,
  userData: CollectedUserData,
  targets: DietTargets,
  previousDays: string,
  feedback: string,
): Promise<AiSingleDay> {
  const completion = await fastify.openai.beta.chat.completions.parse(
    {
      // I5.1: modelo dedicado da geração de dias (default = OPENAI_MODEL).
      model: env.OPENAI_DIET_MODEL,
      // I5.2: fallbacks do OpenRouter (spread não dispara excess-property check).
      ...buildModelsField(env.OPENAI_DIET_MODEL, env.OPENAI_FALLBACK_MODELS),
      messages: [
        { role: 'system', content: DAY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildDayPrompt(userData, targets, dayNumber, previousDays, feedback),
        },
      ],
      response_format: zodResponseFormat(aiSingleDaySchema, 'diet_day'),
      // Reasoning tokens consomem este mesmo orçamento no GPT-5; 6000 truncava
      // o JSON do dia ("length limit was reached"). Folga grande — o teto real
      // de tempo é o maxDuration (300s) + timeout abaixo.
      max_tokens: 20000,
      // Reasoning baixo pra reduzir a latência por dia.
      reasoning_effort: 'low',
    },
    // Timeout explícito abaixo do maxDuration (300s) pra falhar tratável.
    { timeout: 120_000 },
  )
  logAiUsage(fastify, {
    feature: 'diet_day',
    model: env.OPENAI_DIET_MODEL,
    userId,
    usage: completion.usage,
  })
  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error('IA retornou dia vazio')
  return parsed
}

/**
 * Marca job e draft como failed. A dieta ATIVA anterior permanece intocada, e
 * o /retry consegue devolver a draft e continuar de onde parou.
 */
async function failJob(
  fastify: FastifyInstance,
  jobId: string,
  dietId: string,
  error: string,
): Promise<void> {
  await fastify.db`
    UPDATE diet_jobs SET status = 'failed', error = ${error.slice(0, 300)}, updated_at = NOW()
    WHERE id = ${jobId}
  `
  await fastify.db`
    UPDATE diets SET status = 'failed', updated_at = NOW()
    WHERE id = ${dietId} AND status = 'draft'
  `
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
    throw new AppError(
      422,
      'INVALID_JOB_INPUT',
      'Dados da geração inválidos. Refaça a conversa com o coach.',
    )
  }
  const targets = computeTargets(userData)

  // I3: resumo dos dias já gerados para orientar a variedade do próximo.
  const prevRows = await fastify.db<{ day_name: string; foods: string[] }[]>`
    SELECT dd.day_name,
           ARRAY_AGG(di.food_name ORDER BY di.calories DESC) AS foods
    FROM diet_days dd
    JOIN diet_meals dm ON dm.diet_day_id = dd.id
    JOIN diet_items di ON di.diet_meal_id = dm.id AND di.is_substitution = FALSE
    WHERE dd.diet_id = ${job.diet_id}
    GROUP BY dd.day_number, dd.day_name
    ORDER BY dd.day_number
  `
  const previousDays = summarizePreviousDays(prevRows)

  // 1) Gera o dia (chamada longa — SEM segurar transação/lock) e passa pelos
  //    guardrails (O4): alérgeno, kcal, reconcile, estrutura. Uma regeneração
  //    com o feedback das violações; se ainda falhar, o job vai para failed.
  //    NUNCA persiste um dia que não passou.
  let aiDay: AiSingleDay
  try {
    let feedback = ''
    let result: DayGuardrailResult | null = null
    for (let attempt = 1; attempt <= MAX_DAY_ATTEMPTS; attempt++) {
      const generated = await generateDay(
        fastify,
        userId,
        dayNumber,
        userData,
        targets,
        previousDays,
        feedback,
      )
      result = applyDayGuardrails(generated, userData, targets)
      if (result.ok) break
      fastify.log.warn(
        { jobId, dayNumber, attempt, code: result.code, violations: result.violations },
        'Dia rejeitado pelos guardrails',
      )
      feedback = result.feedback
    }
    if (!result || !result.ok) {
      const code = result?.code ?? 'DAY_VALIDATION_FAILED'
      await failJob(fastify, jobId, job.diet_id, code)
      throw new AppError(
        502,
        code,
        'A dieta gerada não passou nas verificações de segurança. Tente novamente.',
      )
    }
    for (const note of result.notes) fastify.log.info({ jobId, dayNumber }, note)
    aiDay = result.day
  } catch (err) {
    if (err instanceof AppError) throw err
    fastify.log.error({ err, jobId, dayNumber }, 'Falha ao gerar dia da dieta')
    await failJob(fastify, jobId, job.diet_id, String(err))
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
                  ${meal.items.reduce((s, i) => s + i.calories, 0)},
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

  // 3) Finaliza se foi o último dia — SÓ AGORA a dieta nova substitui a antiga
  // (transação curta: arquiva a ativa + promove a draft + completa o job).
  const done = dayNumber >= job.total_days
  if (done) {
    await fastify.db.begin(async (sql) => {
      await sql`UPDATE diet_jobs SET status = 'completed', updated_at = NOW() WHERE id = ${jobId}`
      await sql`
        UPDATE diets SET status = 'replaced', updated_at = NOW()
        WHERE user_id = ${userId} AND status = 'active' AND id <> ${job.diet_id}
      `
      await sql`
        UPDATE diets SET status = 'active', updated_at = NOW()
        WHERE id = ${job.diet_id} AND status IN ('draft', 'failed')
      `
    })
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
      await createSystemPost(
        fastify,
        userId,
        'diet_generated',
        'Nova dieta gerada com o Coach IA! 🥗',
        {
          diet_id: job.diet_id,
        },
      )
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
    error: job.error,
  }
}
