import { isValidScanWeight, scaleScanPortion } from './scan-portion';
import type { ScanItem } from '@shared/services/scanner.service';

const item: ScanItem = {
  id: 'rice',
  name: 'Arroz',
  weightGrams: 200,
  calories: 260,
  protein: 5.4,
  carbs: 56,
  fat: 0.6,
  fiber: 2,
  confidence: 0.8,
};

it('reduzir 200 g a 100 g reduz todos os nutrientes pela metade', () => {
  expect(scaleScanPortion(item, 100)).toEqual({
    weightGrams: 100,
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    fiber: 1,
  });
});
it('edições sucessivas preservam precisão interna e fibra desconhecida', () => {
  let current: ScanItem = { ...item, fiber: null };
  for (const weight of [33, 70.5, 100, 200])
    current = { ...current, ...scaleScanPortion(current, weight) };
  expect(current.calories).toBeCloseTo(item.calories, 10);
  expect(current.protein).toBeCloseTo(item.protein, 10);
  expect(current.fiber).toBeNull();
});
it('peso desconhecido não é tratado como 100 g para recalcular nutrientes', () => {
  expect(scaleScanPortion({ ...item, weightGrams: null }, 250)).toEqual({ weightGrams: 250 });
});
it.each([0, 0.001, -1, NaN, Infinity, 100001])('rejeita peso inválido %s', (value) => {
  expect(isValidScanWeight(value)).toBe(false);
  expect(scaleScanPortion(item, value)).toEqual({});
});
