import type { ScanItem } from '@shared/services/scanner.service';

export const MAX_SCAN_WEIGHT_GRAMS = 100_000;

export function isValidScanWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0.1 && value <= MAX_SCAN_WEIGHT_GRAMS;
}

/** Não arredonda internamente: editar a porção repetidamente não perde nutrientes. */
export function scaleScanPortion(item: ScanItem, weightGrams: number): Partial<ScanItem> {
  if (!isValidScanWeight(weightGrams)) return {};
  if (item.weightGrams == null || !isValidScanWeight(item.weightGrams)) return { weightGrams };
  const ratio = weightGrams / item.weightGrams;
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
