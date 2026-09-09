import type { ZodIssue } from 'zod'
import type { CollectedUserData } from '../diet-ai-schema.js'

/**
 * Avaliação de segurança dos dados coletados (S2 da spec de guardrails).
 * Função pura: sem banco, sem modelo. As mensagens já vêm prontas para o
 * coach devolver — a recusa é TEXTO na conversa, nunca um HTTP 4xx (D5).
 */

export const SAFETY_THRESHOLDS = {
  minAdultAge: 18,
  bmiUnderweight: 18.5,
  bmiHigh: 40,
} as const

export type SafetyReason = 'MINOR' | 'HEALTH_CONDITION' | 'UNDERWEIGHT_DEFICIT'

export type SafetyAssessment =
  | { ok: true; warning: 'HIGH_BMI' | null; warningMessage: string | null }
  | { ok: false; reason: SafetyReason; userMessage: string }

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

// Margem contra o ruído de ponto flutuante: bmi(108.9, 165) devolve
// 40.00000000000001, e sem isto um IMC de exatamente 40 dispararia o aviso.
// Epsilon em vez de arredondar: arredondar a 2 casas mexeria na fronteira
// clínica em ~0,005 nas duas bordas, e no sentido de proteger menos.
const BMI_EPSILON = 1e-9

const MINOR_MESSAGE =
  'Obrigado por compartilhar! Como você tem menos de 18 anos, não posso montar um plano ' +
  'alimentar por aqui — nessa fase o acompanhamento precisa ser feito com um responsável e ' +
  'um nutricionista ou pediatra. Posso continuar tirando dúvidas gerais sobre alimentação, ' +
  'se quiser.'

const UNDERWEIGHT_MESSAGE =
  'Pelo seu peso e altura, seu IMC está abaixo de 18,5 — por segurança, não vou montar um ' +
  'plano de perda de peso. Posso montar um plano de MANUTENÇÃO, com calorias equilibradas ' +
  'para o seu corpo. Quer que eu faça isso?'

const HIGH_BMI_WARNING =
  'Observação: como seu IMC está acima de 40, montei o plano com um piso seguro de calorias ' +
  'e recomendo acompanhamento médico junto com a dieta.'

const HEALTH_CONDITION_TAIL =
  'Nesses casos um plano alimentar precisa ser feito por um nutricionista ou médico que ' +
  'conheça seu histórico — por segurança, não vou gerar uma dieta por aqui. Continuo à ' +
  'disposição para conversar sobre alimentação em geral.'

function healthConditionMessage(conditions: string[]): string {
  const lista = conditions.join(', ')
  return `Obrigado por me contar sobre: ${lista}. ${HEALTH_CONDITION_TAIL}`
}

export function assessSafety(
  data: Pick<CollectedUserData, 'age' | 'weight_kg' | 'height_cm' | 'goal' | 'health_conditions'>,
): SafetyAssessment {
  // Ordem importa (D-decision da task): menor vem antes de condição de saúde,
  // que vem antes de IMC — um adolescente com condição relatada é recusado
  // como MINOR, porque é essa mensagem que orienta a envolver um responsável.
  if (data.age < SAFETY_THRESHOLDS.minAdultAge) {
    return { ok: false, reason: 'MINOR', userMessage: MINOR_MESSAGE }
  }
  if (data.health_conditions.length > 0) {
    return {
      ok: false,
      reason: 'HEALTH_CONDITION',
      userMessage: healthConditionMessage(data.health_conditions),
    }
  }
  const imc = bmi(data.weight_kg, data.height_cm)
  if (imc < SAFETY_THRESHOLDS.bmiUnderweight - BMI_EPSILON && data.goal === 'lose_weight') {
    return { ok: false, reason: 'UNDERWEIGHT_DEFICIT', userMessage: UNDERWEIGHT_MESSAGE }
  }
  if (imc > SAFETY_THRESHOLDS.bmiHigh + BMI_EPSILON) {
    return { ok: true, warning: 'HIGH_BMI', warningMessage: HIGH_BMI_WARNING }
  }
  return { ok: true, warning: null, warningMessage: null }
}

const GENERIC_INVALID_MESSAGE =
  'Preciso de mais algumas informações antes de gerar sua dieta. Poderia confirmar seu peso ' +
  'e altura?'

// Parte fixa de cada pergunta de campo, isolada do valor interpolado (que muda a cada
// chamada) — mesmo truque do HEALTH_CONDITION_TAIL acima: mantém a linha dentro de 100
// colunas sem precisar de `+` com uma expressão, o que o linter (useTemplate) rejeitaria.
const WEIGHT_CONFIRM_TAIL = ' kg de peso — está certo? Se for outra unidade, me diga em kg.'
const HEIGHT_CONFIRM_TAIL = ' cm de altura — confere? Me passe em centímetros (ex.: 175).'
const LIST_SUMMARY_MESSAGE =
  'Me passe suas restrições, alergias e preferências de forma resumida (até 10 itens, poucas ' +
  'palavras cada).'

function valueAt(raw: unknown, key: string): string {
  const v = (raw as Record<string, unknown> | null)?.[key]
  return v == null ? '?' : String(v)
}

/**
 * S4: zod falhou por bounds → pergunta ESPECÍFICA por campo, em vez de "confirme
 * peso e altura" para tudo. O valor citado é o que o modelo mandou (raw), para
 * o usuário reconhecer o erro ("1.75" → quis dizer 175).
 */
export function describeInvalidFields(issues: ZodIssue[], raw: unknown): string {
  const fields = [...new Set(issues.map((i) => String(i.path[0] ?? '')))]
  const parts: string[] = []
  for (const f of fields) {
    switch (f) {
      case 'weight_kg':
        parts.push(`Você informou ${valueAt(raw, f)}${WEIGHT_CONFIRM_TAIL}`)
        break
      case 'height_cm':
        parts.push(`Você informou ${valueAt(raw, f)}${HEIGHT_CONFIRM_TAIL}`)
        break
      case 'age':
        parts.push(`Você informou ${valueAt(raw, f)} anos — pode confirmar sua idade?`)
        break
      case 'meals_per_day':
        parts.push('Consigo montar de 3 a 6 refeições por dia — quantas você prefere?')
        break
      case 'dietary_restrictions':
      case 'allergies':
      case 'health_conditions':
      case 'food_preferences':
        parts.push(LIST_SUMMARY_MESSAGE)
        break
      default:
        break
    }
  }
  return parts.length > 0 ? [...new Set(parts)].join(' ') : GENERIC_INVALID_MESSAGE
}
