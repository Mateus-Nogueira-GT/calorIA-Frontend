/**
 * Faixas plausíveis do corpo. Fora delas o valor é erro de digitação, não
 * dado: não é aceito na entrada e não aparece em gráfico nem conta. Espelha
 * BODY_LIMITS de backend/src/shared/body-limits.ts.
 */
export const BODY_LIMITS = {
  weightKg: { min: 30, max: 300 },
  heightCm: { min: 100, max: 250 },
  age: { min: 13, max: 100 },
} as const;

export function isPlausibleWeightKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= BODY_LIMITS.weightKg.min && kg <= BODY_LIMITS.weightKg.max;
}

export const WEIGHT_RANGE_MESSAGE = `Informe um peso entre ${BODY_LIMITS.weightKg.min} e ${BODY_LIMITS.weightKg.max} kg.`;
