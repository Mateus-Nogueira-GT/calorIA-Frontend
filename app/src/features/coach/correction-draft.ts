import type { Meal } from '@shared/services/food-log.service';

/** Mesma ref curta que o servidor mostra ao coach (backend chat-context mealRef). */
export function mealRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 6);
}

/**
 * 04/11: "Corrigir com o coach" no Diário. Abre o Coach com a mensagem
 * começada; o usuário completa com o alimento certo e envia. O peso vai
 * junto para o coach recalcular "no mesmo peso".
 * 05/11 (M6): a data e a ref também — o coach só via as refs de hoje, e o
 * registro de outro dia nunca era encontrado.
 */
export function correctionDraft(meal: Meal, date: string): string {
  const [, mm, dd] = date.split('-');
  const weight = meal.weightGrams != null ? `${Math.round(meal.weightGrams * 10) / 10} g, ` : '';
  return `Corrigir o registro "${meal.name}" (${weight}${dd}/${mm} · ref ${mealRef(meal.id)}): na verdade era `;
}
