import type { FastifyInstance } from 'fastify'
import { utcTodayString } from '../../shared/local-date.js'
import type { TodayPlan, TodayQuery } from '../diets/diets.schemas.js'
import { getActiveDiet, getTodayPlan } from '../diets/diets.service.js'
import { parseInput } from '../diets/jobs.service.js'
import type { Meal } from '../food-log/food-log.schemas.js'
import { listMeals } from '../food-log/food-log.service.js'

/**
 * Contexto do usuário para o coach (Workstream I1/I2). Sem isto o coach é
 * "cego": as sugestões da tela ("quanta proteína falta hoje?") viravam resposta
 * genérica de blog. Montamos um bloco compacto de texto com dados REAIS.
 *
 * Toda coleta é tolerante a falha (cada fonte em try/catch → campo null); o
 * chat nunca é bloqueado por um erro de contexto.
 */

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'perder peso',
  maintain: 'manter peso',
  gain_muscle: 'ganhar massa',
  gain_weight: 'ganhar peso',
  health: 'saúde',
}

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: 'sedentária',
  light: 'leve',
  moderate: 'moderada',
  active: 'ativa',
  very_active: 'muito ativa',
}

const GENDER_LABELS: Record<string, string> = {
  male: 'masculino',
  female: 'feminino',
  other: 'outro',
}

const CONTEXT_MAX_CHARS = 1400
const LIST_MAX_ITEMS = 6

interface ContextProfile {
  weight_kg: number | null
  height_cm: number | null
  birth_date: string | null
  gender: string | null
  goal: string | null
  activity_level: string | null
  dietary_restrictions: string[] | null
  allergies: string[] | null
}

export interface UserContextData {
  profile: ContextProfile | null
  diet: {
    name: string
    targetCalories: number
    targetProtein: number
    targetCarbs: number
    targetFat: number
  } | null
  today: TodayPlan | null
  freeMeals: Meal[]
  streak: number | null
  mealsPerDay: number | null
  date: string
}

/** Idade (anos) a partir de 'YYYY-MM-DD'; null se ausente/inválida. */
export function ageFromBirthDate(birthDate: string | null, now: Date = new Date()): number | null {
  if (!birthDate) return null
  const born = new Date(`${birthDate}T00:00:00Z`)
  if (Number.isNaN(born.getTime())) return null
  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const m = now.getUTCMonth() - born.getUTCMonth()
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) age--
  return age >= 0 && age < 130 ? age : null
}

/** Dia da semana (1=Seg…7=Dom) de uma data local 'YYYY-MM-DD'. */
function dayNumberFromDate(date: string): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
}

/** Coleta o contexto do usuário. Cada fonte falha em silêncio (campo null). */
export async function fetchUserContext(
  fastify: FastifyInstance,
  userId: string,
  query: TodayQuery = {},
): Promise<UserContextData> {
  const date = query.date ?? utcTodayString()
  const todayQuery: TodayQuery = {
    date,
    tzOffsetMinutes: query.tzOffsetMinutes,
    dayNumber: query.dayNumber ?? dayNumberFromDate(date),
  }

  let profile: ContextProfile | null = null
  try {
    const [row] = await fastify.db<ContextProfile[]>`
      SELECT weight_kg, height_cm, birth_date::TEXT AS birth_date, gender, goal,
             activity_level, dietary_restrictions, allergies
      FROM profiles WHERE id = ${userId}
    `
    profile = row ?? null
  } catch {
    profile = null
  }

  let diet: UserContextData['diet'] = null
  try {
    const d = await getActiveDiet(fastify, userId)
    diet = {
      name: d.name,
      targetCalories: d.target_calories,
      targetProtein: d.target_protein_g,
      targetCarbs: d.target_carbs_g,
      targetFat: d.target_fat_g,
    }
  } catch {
    diet = null
  }

  let today: TodayPlan | null = null
  try {
    today = await getTodayPlan(fastify, userId, todayQuery)
  } catch {
    today = null
  }

  let freeMeals: Meal[] = []
  try {
    freeMeals = await listMeals(fastify, userId, date)
  } catch {
    freeMeals = []
  }

  let streak: number | null = null
  try {
    const [row] = await fastify.db<{ current_streak: number }[]>`
      SELECT current_streak FROM streaks WHERE user_id = ${userId}
    `
    streak = row?.current_streak ?? null
  } catch {
    streak = null
  }

  let mealsPerDay: number | null = null
  try {
    const [row] = await fastify.db<{ input: unknown }[]>`
      SELECT input FROM diet_jobs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
    `
    mealsPerDay = row ? (parseInput(row.input)?.meals_per_day ?? null) : null
  } catch {
    mealsPerDay = null
  }

  return { profile, diet, today, freeMeals, streak, mealsPerDay, date }
}

// ─── I1: bloco de CONTEXTO (progresso do dia, metas, próxima refeição) ────────

function consumedToday(data: UserContextData): {
  calories: number
  protein: number
  planCompleted: number
  planTotal: number
} {
  let calories = 0
  let protein = 0
  let planCompleted = 0
  const planTotal = data.today?.meals.length ?? 0
  for (const meal of data.today?.meals ?? []) {
    if (meal.completedToday) {
      calories += meal.calories
      protein += meal.protein
      planCompleted++
    }
  }
  for (const meal of data.freeMeals) {
    calories += meal.calories
    protein += meal.protein
  }
  return { calories: Math.round(calories), protein: Math.round(protein), planCompleted, planTotal }
}

/** Bloco de contexto (pura). String vazia se não houver nada útil. */
export function formatUserContext(data: UserContextData): string {
  const lines: string[] = []
  const p = data.profile

  if (p && (p.weight_kg || p.height_cm || p.goal)) {
    const bits: string[] = []
    if (p.weight_kg) bits.push(`${p.weight_kg}kg`)
    if (p.height_cm) bits.push(`${p.height_cm}cm`)
    const age = ageFromBirthDate(p.birth_date)
    if (age != null) bits.push(`${age} anos`)
    if (p.gender) bits.push(GENDER_LABELS[p.gender] ?? p.gender)
    if (p.goal) bits.push(`objetivo: ${GOAL_LABELS[p.goal] ?? p.goal}`)
    if (p.activity_level)
      bits.push(`atividade: ${ACTIVITY_LABELS[p.activity_level] ?? p.activity_level}`)
    lines.push(`Perfil: ${bits.join(', ')}.`)
  }

  if (p?.dietary_restrictions?.length || p?.allergies?.length) {
    const parts: string[] = []
    if (p.dietary_restrictions?.length)
      parts.push(`Restrições: ${p.dietary_restrictions.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    if (p.allergies?.length)
      parts.push(`Alergias: ${p.allergies.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    lines.push(`${parts.join('. ')}.`)
  }

  if (data.diet) {
    lines.push(
      `Dieta ativa: "${data.diet.name}" — meta ${data.diet.targetCalories} kcal | ` +
        `${data.diet.targetProtein}g prot | ${data.diet.targetCarbs}g carb | ${data.diet.targetFat}g gord.`,
    )
    const c = consumedToday(data)
    lines.push(
      `Hoje (${data.date}): consumidas ${c.calories} kcal / ${c.protein}g prot ` +
        `(plano: ${c.planCompleted} de ${c.planTotal} refeições concluídas; diário livre: ${data.freeMeals.length} item(ns)).`,
    )
    const remainingCal = data.diet.targetCalories - c.calories
    const remainingProt = data.diet.targetProtein - c.protein
    lines.push(`Faltam: ${remainingCal} kcal, ${remainingProt}g proteína.`)
    const next = data.today?.meals.find((m) => !m.completedToday)
    if (next) {
      const at = next.suggestedTime ? ` (${next.suggestedTime})` : ''
      lines.push(
        `Próxima refeição do plano: ${next.title}${at} — ${Math.round(next.calories)} kcal.`,
      )
    }
  } else {
    const c = consumedToday(data)
    if (data.freeMeals.length > 0) {
      lines.push(
        `Hoje (${data.date}): ${c.calories} kcal / ${c.protein}g prot no diário livre (sem dieta ativa gerada).`,
      )
    }
  }

  if (data.streak != null && data.streak > 0) lines.push(`Streak atual: ${data.streak} dias.`)

  if (lines.length === 0) return ''

  const header = '## CONTEXTO DO USUÁRIO (dados reais — use-os; não invente valores)'
  const block = `${header}\n${lines.join('\n')}`
  return block.length > CONTEXT_MAX_CHARS ? block.slice(0, CONTEXT_MAX_CHARS) : block
}

// ─── I2: bloco de DADOS JÁ CONHECIDOS (pré-preenche a coleta) ─────────────────

/** Lista os campos obrigatórios já conhecidos, para o coach só confirmar. */
export function formatKnownData(data: UserContextData): string {
  const p = data.profile
  if (!p) return ''
  const bits: string[] = []
  if (p.weight_kg) bits.push(`peso: ${p.weight_kg}kg`)
  if (p.height_cm) bits.push(`altura: ${p.height_cm}cm`)
  const age = ageFromBirthDate(p.birth_date)
  if (age != null) bits.push(`idade: ${age} anos`)
  if (p.gender) bits.push(`sexo: ${GENDER_LABELS[p.gender] ?? p.gender}`)
  if (p.goal) bits.push(`objetivo: ${GOAL_LABELS[p.goal] ?? p.goal}`)
  if (p.activity_level)
    bits.push(`atividade: ${ACTIVITY_LABELS[p.activity_level] ?? p.activity_level}`)
  if (data.mealsPerDay) bits.push(`refeições/dia: ${data.mealsPerDay}`)
  if (p.dietary_restrictions?.length)
    bits.push(`restrições: ${p.dietary_restrictions.slice(0, LIST_MAX_ITEMS).join(', ')}`)
  if (p.allergies?.length) bits.push(`alergias: ${p.allergies.slice(0, LIST_MAX_ITEMS).join(', ')}`)

  if (bits.length === 0) return ''
  return `## DADOS JÁ CONHECIDOS DO USUÁRIO\n${bits.join('; ')}.`
}
