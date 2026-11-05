import type { Meal } from '@shared/services/food-log.service';

/**
 * 04/11: "Corrigir com o coach" no Diário. Abre o Coach com a mensagem
 * começada; o usuário completa com o alimento certo e envia. O peso vai
 * junto para o coach recalcular "no mesmo peso".
 */
export function correctionDraft(meal: Meal): string {
  const weight = meal.weightGrams != null ? ` (${Math.round(meal.weightGrams * 10) / 10} g)` : '';
  return `Corrigir o registro "${meal.name}"${weight}: na verdade era `;
}
