import type { FastifyInstance } from 'fastify'
import { BODY_LIMITS } from '../../shared/body-limits.js'
import { utcTodayString } from '../../shared/local-date.js'
import type { TodayPlan, TodayQuery } from '../diets/diets.schemas.js'
import { getActiveDiet, getTodayPlan } from '../diets/diets.service.js'
import { parseInput } from '../diets/jobs.service.js'
import type { Meal } from '../food-log/food-log.schemas.js'
import { isImplausibleMeal } from '../food-log/food-log.schemas.js'
import type { DaySummary } from '../food-log/food-log.schemas.js'
import { getSummary, listMeals } from '../food-log/food-log.service.js'

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

// Rótulos do onboarding (biotipo é informativo — não é dado obrigatório).
const BODY_TYPE_LABELS: Record<string, string> = {
  ectomorph: 'Magro / Acelerado (ectomorfo)',
  mesomorph: 'Atlético / Versátil (mesomorfo)',
  endomorph: 'Largo (endomorfo)',
}

// Na coleta, 'health' não existe no enum da tool: orienta o modelo a usar maintain.
const KNOWN_GOAL_LABELS: Record<string, string> = {
  ...GOAL_LABELS,
  health: 'manter peso / melhorar saúde (use goal=maintain)',
}

// 04/11: a lista dos registros do dia entrou no contexto (até 8 linhas).
// 05/11: e o plano de hoje e os dias anteriores — o teto subiu de novo.
const CONTEXT_MAX_CHARS = 3600
const DIARY_MAX_ITEMS = 8
const NAME_MAX_CHARS = 60
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
  body_type?: string | null
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
  /** Fuso do app (min): horário local dos registros na lista do diário. */
  tzOffsetMinutes?: number
  /** Registro mais recente da Evolução (faixa plausível); mais novo que o cadastro. */
  lastWeight?: { kg: number; date: string } | null
  /** Totais do diário nos 6 dias anteriores (só os dias com registro). */
  recentDays?: DaySummary[] | null
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

const pad2 = (n: number) => String(n).padStart(2, '0')

/** "2026-11-03 23:14:00+00" → "20:14" no fuso do app; '' se não der para ler. */
function localTime(loggedAt: string, tzOffsetMinutes = 0): string {
  const d = new Date(loggedAt.replace(' ', 'T').replace(/\+00$/, 'Z'))
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() + tzOffsetMinutes * 60_000)
  return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`
}

/** Referência curta do registro, usada pela tool update_logged_meal. */
export function mealRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 6)
}

const fmtG = (n: number) => `${Math.round(n * 10) / 10}`

/** Nome de registro/prato no contexto: um nome gigante não pode comer o teto. */
function shortName(name: string): string {
  return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS - 1).trimEnd()}…` : name
}

/** Abaixo disto o registro do scanner aparece como duvidoso para o coach. */
const SCAN_DOUBT_BELOW = 0.7

/** 05/11 (S4): o coach não sabia que o "carne suína" do scanner era incerto. */
function doubtSuffix(m: Meal): string {
  if (!m.scan) return ''
  const { confidence, alternatives } = m.scan
  if (confidence >= SCAN_DOUBT_BELOW && alternatives.length === 0) return ''
  const alt = alternatives.length ? `; podia ser: ${alternatives.map(shortName).join(', ')}` : ''
  return ` (scanner, confiança ${Math.round(confidence * 100)}%${alt})`
}

/**
 * Feedback de 04/11: o contexto trazia só "diário livre: 2 item(ns)" — o
 * coach não sabia O QUE foi registrado e não conseguia analisar "minha
 * refeição". Agora a lista vai com nome, peso, valores e ref.
 */
function diaryLines(data: UserContextData): string[] {
  const out: string[] = []
  if (data.freeMeals.length === 0) return out
  const recent = [...data.freeMeals]
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0))
    .slice(0, DIARY_MAX_ITEMS)
  out.push('Registros de hoje no diário (mais recentes primeiro):')
  for (const m of recent) {
    const time = localTime(m.loggedAt, data.tzOffsetMinutes)
    const weight = m.weightGrams != null ? `${fmtG(m.weightGrams)} g · ` : ''
    out.push(
      `- [ref ${mealRef(m.id)}] ${time ? `${time} ` : ''}${shortName(m.name)} — ${weight}${Math.round(m.calories)} kcal · ` +
        `P ${fmtG(m.protein)} g · C ${fmtG(m.carbs)} g · G ${fmtG(m.fat)} g${doubtSuffix(m)}.`,
    )
  }
  out.push(
    'INSTRUÇÃO: quando o usuário falar de "minha refeição", do que comeu ou de um registro, use esta lista ' +
      '(é a fonte da verdade); se o item não estiver nela nem o usuário citar a ref dele, diga que ' +
      'não há esse registro hoje. Registro marcado "(scanner, …)" é duvidoso: se o usuário analisar ' +
      'o dia ou estranhar um valor, mencione a dúvida e ofereça a correção.',
  )
  return out
}

const PLAN_ITEMS_MAX = 6

/**
 * 05/11 (M5): do plano o coach só via a próxima refeição (título e kcal).
 * "O que tem no meu almoço?" e "Sugira uma refeição" eram respondidos sem o
 * plano. Uma linha por refeição, com os itens.
 */
function planLines(today: TodayPlan | null): string[] {
  if (!today?.meals.length) return []
  const out = ['Plano de hoje:']
  for (const m of today.meals) {
    const items = m.items
      .slice(0, PLAN_ITEMS_MAX)
      .map((i) => `${shortName(i.name)} ${fmtG(i.quantity)} ${i.unit}`)
    const extra = m.items.length - PLAN_ITEMS_MAX
    if (extra > 0) items.push(`+${extra} ${extra === 1 ? 'item' : 'itens'}`)
    const at = m.suggestedTime ? `${m.suggestedTime} ` : ''
    const done = m.completedToday ? ' (concluída)' : ''
    out.push(
      `- [plano ${mealRef(m.id)}] ${at}${m.title}${done} — ${Math.round(m.calories)} kcal${items.length ? `: ${items.join(', ')}` : ''}.`,
    )
  }
  out.push(
    'INSTRUÇÃO: perguntas sobre o plano usam esta lista. Se o usuário quiser trocar um item, ' +
      'sugira a troca com quantidade equivalente, sem dizer que alterou o plano.',
  )
  return out
}

/**
 * Peso, altura ou idade fora das faixas do corpo (ex.: perfil antigo com
 * 0,1 kg) não é dado: some do contexto e o coach pergunta de novo, em vez de
 * dizer "vou usar seu peso de 0,1 kg".
 */
function plausibleProfile(p: ContextProfile | null): ContextProfile | null {
  if (!p) return p
  const inRange = (v: number | null, r: { min: number; max: number }) =>
    v != null && v >= r.min && v <= r.max ? v : null
  const age = ageFromBirthDate(p.birth_date)
  const ageOk = age != null && age >= BODY_LIMITS.age.min && age <= BODY_LIMITS.age.max
  return {
    ...p,
    weight_kg: inRange(p.weight_kg, BODY_LIMITS.weightKg),
    height_cm: inRange(p.height_cm, BODY_LIMITS.heightCm),
    birth_date: ageOk ? p.birth_date : null,
  }
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
             activity_level, dietary_restrictions, allergies, body_type
      FROM profiles WHERE id = ${userId}
    `
    // DECIMAL chega como string ('80.50') do postgres.js → número (80.5).
    profile = row
      ? {
          ...row,
          weight_kg: toNumberOrNull(row.weight_kg),
          height_cm: toNumberOrNull(row.height_cm),
        }
      : null
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

  // 04/11: o coach só conhecia o peso do cadastro, não o registrado na Evolução.
  let lastWeight: { kg: number; date: string } | null = null
  try {
    const [row] = await fastify.db<{ weight_kg: string | number; date: string }[]>`
      SELECT weight_kg, date::TEXT AS date FROM weight_entries
      WHERE user_id = ${userId}
        AND weight_kg BETWEEN ${BODY_LIMITS.weightKg.min} AND ${BODY_LIMITS.weightKg.max}
      ORDER BY date DESC, created_at DESC LIMIT 1
    `
    lastWeight = row ? { kg: Number(row.weight_kg), date: row.date } : null
  } catch {
    lastWeight = null
  }

  // 05/11 (M6): "como foi minha semana?" ficava sem nenhum dado.
  let recentDays: DaySummary[] | null = null
  try {
    recentDays = await getSummary(fastify, userId, shiftDate(date, -6), shiftDate(date, -1))
  } catch {
    recentDays = null
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

  return {
    profile,
    diet,
    today,
    freeMeals,
    streak,
    mealsPerDay,
    date,
    tzOffsetMinutes: query.tzOffsetMinutes,
    lastWeight,
    recentDays,
  }
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

/**
 * Bloco de contexto (pura). String vazia se não houver nada útil.
 * C4: linhas numéricas primeiro (meta, consumido, faltam, próxima) e corte POR
 * LINHA — o corte por caractere podia virar "Faltam: 12" logo abaixo de "nunca
 * invente valores".
 */
export function formatUserContext(raw: UserContextData): string {
  const lines: string[] = []
  const p = plausibleProfile(raw.profile)
  // Registro impossível (ex.: 999.999 kcal) não é consumo: fora das contas. O
  // coach fica sabendo que ele existe para pedir correção, nunca para repetir o número.
  const freeMeals = raw.freeMeals.filter((m) => !isImplausibleMeal(m))
  const ignored = raw.freeMeals.length - freeMeals.length
  const data = { ...raw, freeMeals }

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
    lines.push(
      `Restante do dia: ${remainingText(data.diet.targetCalories - c.calories, 'kcal')}; ` +
        `${remainingText(data.diet.targetProtein - c.protein, 'protein')}.`,
    )
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

  // 05/11 (M9): o corte é do fim para o começo. O aviso e o perfil vêm antes
  // das listas longas (diário, plano), que são as que podem ficar de fora.
  if (ignored > 0) {
    const one = ignored === 1
    lines.push(
      `${ignored} ${one ? 'registro' : 'registros'} com valores impossíveis no diário de hoje ` +
        `${one ? 'foi ignorado' : 'foram ignorados'} nas contas — se o usuário falar do dia, ` +
        `peça para corrigir ou apagar ${one ? 'esse registro' : 'esses registros'} no Diário.`,
    )
  }

  // 05/11 (M7): um peso só — o da Evolução, se houver, é o mais recente.
  const weight = data.lastWeight
    ? `${data.lastWeight.kg}kg (Evolução, ${ddmm(data.lastWeight.date)})`
    : p?.weight_kg
      ? `${p.weight_kg}kg`
      : null
  if (p && (weight || p.height_cm || p.goal)) {
    const bits: string[] = []
    if (weight) bits.push(weight)
    if (p.height_cm) bits.push(`${p.height_cm}cm`)
    const age = ageFromBirthDate(p.birth_date)
    if (age != null) bits.push(`${age} anos`)
    if (p.gender) bits.push(GENDER_LABELS[p.gender] ?? p.gender)
    if (p.goal) bits.push(`objetivo: ${GOAL_LABELS[p.goal] ?? p.goal}`)
    if (p.activity_level)
      bits.push(`atividade: ${ACTIVITY_LABELS[p.activity_level] ?? p.activity_level}`)
    lines.push(`Perfil: ${bits.join(', ')}.`)
  } else if (weight) {
    lines.push(`Peso atual: ${weight}.`)
  }

  if (p?.dietary_restrictions?.length || p?.allergies?.length) {
    const parts: string[] = []
    if (p.dietary_restrictions?.length)
      parts.push(`Restrições: ${p.dietary_restrictions.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    if (p.allergies?.length)
      parts.push(`Alergias: ${p.allergies.slice(0, LIST_MAX_ITEMS).join(', ')}`)
    lines.push(`${parts.join('. ')}.`)
  }

  lines.push(...planLines(data.today), ...diaryLines(data))

  lines.push(...recentDaysLines(data))
  if (data.streak != null && data.streak > 0) lines.push(`Streak atual: ${data.streak} dias.`)

  if (lines.length === 0) return ''

  const header = '## CONTEXTO DO USUÁRIO (dados reais — use-os; não invente valores)'
  return truncateByLines(header, lines, CONTEXT_MAX_CHARS)
}

/** 'YYYY-MM-DD' deslocada em N dias. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Os 6 dias anteriores, inclusive os sem registro; nada se não houver nenhum. */
function recentDaysLines(data: UserContextData): string[] {
  if (!data.recentDays?.length) return []
  const byDate = new Map(data.recentDays.map((d) => [d.date, d]))
  const days: string[] = []
  for (let i = -6; i <= -1; i++) {
    const date = shiftDate(data.date, i)
    const d = byDate.get(date)
    days.push(
      d ? `${ddmm(date)} ${d.calories} kcal / ${d.protein}g prot` : `${ddmm(date)} sem registro`,
    )
  }
  return [
    `Últimos dias (só diário): ${days.join(' · ')}.`,
    'INSTRUÇÃO: refeições do plano marcadas como concluídas em dias passados não aparecem nesses ' +
      'totais — não conclua que o usuário não comeu; pergunte.',
  ]
}

/** 'YYYY-MM-DD' → 'dd/mm'. */
function ddmm(date: string): string {
  const [, mm, dd] = date.split('-')
  return `${dd}/${mm}`
}

/**
 * 05/11 (M8): "Faltam: -350 kcal" quando o usuário passou da meta. Cada número
 * sai na forma certa: falta, passou ou atingida.
 */
function remainingText(remaining: number, kind: 'kcal' | 'protein'): string {
  const n = Math.abs(Math.round(remaining))
  if (kind === 'kcal') {
    if (n === 0) return 'meta de calorias atingida'
    return remaining > 0 ? `faltam ${n} kcal` : `passou da meta em ${n} kcal`
  }
  if (n === 0) return 'meta de proteína atingida'
  return remaining > 0 ? `faltam ${n}g de proteína` : `passou da meta de proteína em ${n}g`
}

/** Acrescenta linhas inteiras até o teto; a primeira que não couber encerra. */
export function truncateByLines(header: string, lines: string[], max: number): string {
  let out = header
  for (const line of lines) {
    if (out.length + 1 + line.length > max) break
    out += `\n${line}`
  }
  return out
}

// ─── I2: bloco de DADOS JÁ CONHECIDOS (pré-preenche a coleta) ─────────────────

/** Lista os campos obrigatórios já conhecidos, para o coach só confirmar. */
export function formatKnownData(data: UserContextData): string {
  const p = plausibleProfile(data.profile)
  if (!p) return ''
  const bits: string[] = []
  // O peso da Evolução é mais recente que o do cadastro.
  const weight = data.lastWeight?.kg ?? p.weight_kg
  if (weight) bits.push(`peso: ${weight}kg`)
  if (p.height_cm) bits.push(`altura: ${p.height_cm}cm`)
  const age = ageFromBirthDate(p.birth_date)
  if (age != null) bits.push(`idade: ${age} anos`)
  if (p.gender) bits.push(`sexo: ${GENDER_LABELS[p.gender] ?? p.gender}`)
  if (p.goal) bits.push(`objetivo: ${KNOWN_GOAL_LABELS[p.goal] ?? p.goal}`)
  if (p.activity_level)
    bits.push(`atividade: ${ACTIVITY_LABELS[p.activity_level] ?? p.activity_level}`)
  const bodyType = p.body_type ? BODY_TYPE_LABELS[p.body_type] : undefined
  if (bodyType) bits.push(`biotipo: ${bodyType}`)
  if (data.mealsPerDay) bits.push(`refeições/dia: ${data.mealsPerDay}`)
  if (p.dietary_restrictions?.length)
    bits.push(`restrições: ${p.dietary_restrictions.slice(0, LIST_MAX_ITEMS).join(', ')}`)
  if (p.allergies?.length) bits.push(`alergias: ${p.allergies.slice(0, LIST_MAX_ITEMS).join(', ')}`)

  if (bits.length === 0) return ''
  return `## DADOS JÁ CONHECIDOS DO USUÁRIO\n${bits.join('; ')}.`
}
