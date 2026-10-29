import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';
import { isImplausibleMeal } from './meal-plausibility';

/**
 * R5: existia um DEFAULT_CALORIE_GOAL = 2000 aqui. Sem plano, o Dashboard
 * exibia 2000 kcal (e 150g/250g/65g de macro) como se fossem as metas da
 * pessoa. Quem tem 1,60m querendo emagrecer via exatamente o mesmo que quem
 * tem 1,90m querendo ganhar massa, sem nenhuma pista de que era chute. Num app
 * de nutrição, número inventado é pior que ausência de número: a pessoa decide
 * o que comer com base nele.
 *
 * `null` = ainda não há meta. Quem renderiza decide como dizer isso.
 */
export function getDailyCalorieGoal(plan: DietPlan | null | undefined): number | null {
  return plan && plan.totalCalories > 0 ? plan.totalCalories : null;
}

export function sumCalories(meals: Meal[]): number {
  return meals.reduce((acc, m) => acc + m.calories, 0);
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Soma da fibra conhecida (registro sem dado conta 0). */
  fiber: number;
}

type MacroSource = Pick<DayTotals, 'calories' | 'protein' | 'carbs' | 'fat'> & {
  fiber?: number | null;
};

function sumMacros(items: MacroSource[]): DayTotals {
  return items.reduce<DayTotals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      fiber: acc.fiber + (m.fiber ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

/**
 * M6: regra ÚNICA do que a pessoa comeu no dia — refeições do plano concluídas
 * mais o diário livre (que inclui o scanner). Dashboard e Diário somavam
 * diferente e comparavam com a mesma meta: o mesmo dia aparecia como
 * "2000 / 2000" numa tela e "200 / 2000" na outra.
 *
 * `plan` só existe para HOJE (completedToday não diz nada sobre dias anteriores),
 * então em dias passados o chamador passa apenas o diário livre.
 */
export function getDayTotals(params: {
  planMeals?: (MacroSource & { completedToday: boolean })[];
  freeMeals: MacroSource[];
}): DayTotals {
  const completedPlanned = (params.planMeals ?? []).filter((m) => m.completedToday);
  const planned = sumMacros(completedPlanned);
  // Registro impossível (999.999…) não é consumo: fora da conta.
  const free = sumMacros(params.freeMeals.filter((m) => !isImplausibleMeal(m)));
  // Soma de decimais em ponto flutuante (245,7 + 312,4 = 558.0999999999999)
  // chegava crua na tela. Calorias inteiras, gramas com uma casa.
  return {
    calories: Math.round(planned.calories + free.calories),
    protein: oneDecimal(planned.protein + free.protein),
    carbs: oneDecimal(planned.carbs + free.carbs),
    fat: oneDecimal(planned.fat + free.fat),
    fiber: oneDecimal(planned.fiber + free.fiber),
  };
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** Meta de fibra = soma do plano de hoje; null se nenhuma refeição tiver o dado (dieta antiga). */
export function getDailyFiberGoal(plan: DietPlan | null | undefined): number | null {
  const known = (plan?.meals ?? []).filter((m) => m.fiber != null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((acc, m) => acc + (m.fiber ?? 0), 0));
}

/**
 * Rótulo "N% da meta" único para anel, resumo e cards de macro. Antes só o anel
 * tinha teto: um registro de 999.999 kcal mostrava "999%+" no anel e "58997%"
 * ao lado, na mesma tela.
 */
export function formatGoalPercent(current: number, goal: number | null): string {
  if (goal === null || goal <= 0) return '--';
  const percent = Math.round(Math.max(current / goal, 0) * 100);
  return percent > 999 ? '999%+' : `${percent}%`;
}
