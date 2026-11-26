import type { ScanItem } from '@shared/services/scanner.service';
import { isImplausibleMeal } from './meal-plausibility';

/**
 * Teto de UM alimento na revisão do scanner. Era 100 kg: uma porção de 100 kg
 * passava aqui e o servidor recusava ao salvar (teto de 5.000 kcal por
 * refeição), com um "Tente novamente" que nunca funcionava.
 */
export const MAX_SCAN_WEIGHT_GRAMS = 5000;

export const SCAN_VALUES_ERROR =
  'Valores acima do possível para um alimento: até 5.000 kcal e 500 g de proteína, carboidratos ou gordura.';

/** Mensagem para o usuário quando o item não pode ser salvo; null se está ok. */
export function scanItemProblem(item: ScanItem): string | null {
  return isImplausibleMeal(item) ? SCAN_VALUES_ERROR : null;
}

export function isValidScanWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0.1 && value <= MAX_SCAN_WEIGHT_GRAMS;
}

/**
 * Não arredonda internamente: editar a porção repetidamente não perde nutrientes.
 * O teto de 5 kg vale só para o peso novo: a origem pode ser uma panela de 6 kg
 * (C1, pente fino 25/11), e trocar só o peso salvava 600 g com as kcal de 6 kg.
 */
export function scaleScanPortion(item: ScanItem, weightGrams: number): Partial<ScanItem> {
  if (!isValidScanWeight(weightGrams)) return {};
  const origin = item.weightGrams;
  if (origin == null || !Number.isFinite(origin) || origin <= 0) return { weightGrams };
  const ratio = weightGrams / origin;
  return {
    weightGrams,
    calories: item.calories * ratio,
    protein: item.protein * ratio,
    carbs: item.carbs * ratio,
    fat: item.fat * ratio,
    fiber: item.fiber == null ? item.fiber : item.fiber * ratio,
  };
}

export function roundScanAmount(value: number): number {
  return Math.round(value * 10) / 10;
}
