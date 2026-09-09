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
