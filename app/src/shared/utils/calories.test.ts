import { describe, it, expect } from '@jest/globals';
import {
  formatGoalPercent,
  getDailyCalorieGoal,
  getDailyFiberGoal,
  sumCalories,
  getDayTotals,
} from './calories';
import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

const plan = (totalCalories: number): DietPlan => ({
  id: 'p', date: '2026-06-25', meals: [], totalCalories, totalProtein: 0, totalCarbs: 0, totalFat: 0, generatedAt: '2026-06-25T00:00:00Z',
});
const meal = (calories: number): Meal => ({ id: 'm', name: 'x', calories, protein: 0, carbs: 0, fat: 0, loggedAt: '2026-06-25T08:00:00Z', mealType: 'other' as const });

describe('getDailyCalorieGoal', () => {
  it('usa o total do plano quando > 0', () => {
    expect(getDailyCalorieGoal(plan(1850))).toBe(1850);
  });
  it('devolve null quando não há plano — sem meta inventada (R5)', () => {
    expect(getDailyCalorieGoal(null)).toBeNull();
    expect(getDailyCalorieGoal(undefined)).toBeNull();
  });
  it('devolve null quando o plano tem 0 calorias (R5)', () => {
    expect(getDailyCalorieGoal(plan(0))).toBeNull();
  });
});

describe('sumCalories', () => {
  it('soma as calorias das refeições', () => {
    expect(sumCalories([meal(200), meal(300)])).toBe(500);
  });
  it('retorna 0 para lista vazia', () => {
    expect(sumCalories([])).toBe(0);
  });
});

describe('getDayTotals (M6 — regra única de soma)', () => {
  const planned = (completedToday: boolean, calories: number) => ({
    completedToday,
    calories,
    protein: 10,
    carbs: 20,
    fat: 5,
  });
  const free = (calories: number) => ({ calories, protein: 1, carbs: 2, fat: 3 });

  it('soma refeições do plano CONCLUÍDAS mais o diário livre', () => {
    const totals = getDayTotals({
      planMeals: [planned(true, 600), planned(true, 1200), planned(false, 400)],
      freeMeals: [free(200)],
    });
    // 600 + 1200 do plano (a de 400 não foi concluída) + 200 do diário
    expect(totals.calories).toBe(2000);
  });

  it('ignora refeições do plano não concluídas', () => {
    expect(getDayTotals({ planMeals: [planned(false, 900)], freeMeals: [] }).calories).toBe(0);
  });

  it('sem plano (dia anterior), soma só o diário livre', () => {
    // É o caso do Diário em dias passados: completedToday não vale para eles.
    expect(getDayTotals({ freeMeals: [free(200), free(300)] }).calories).toBe(500);
  });

  it('soma os macros junto com as calorias', () => {
    const totals = getDayTotals({ planMeals: [planned(true, 600)], freeMeals: [free(200)] });
    expect(totals).toEqual({ calories: 800, protein: 11, carbs: 22, fat: 8, fiber: 0 });
  });

  it('dia vazio zera tudo', () => {
    expect(getDayTotals({ planMeals: [], freeMeals: [] })).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    });
  });
});

describe('fibra nos totais do dia', () => {
  it('soma a fibra conhecida do plano concluído e do diário; ausente conta 0', () => {
    const totals = getDayTotals({
      planMeals: [
        { completedToday: true, calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 4 },
        { completedToday: false, calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 9 },
      ],
      freeMeals: [
        { calories: 50, protein: 1, carbs: 1, fat: 1, fiber: 2.5 },
        { calories: 50, protein: 1, carbs: 1, fat: 1, fiber: null },
        { calories: 50, protein: 1, carbs: 1, fat: 1 },
      ],
    });
    expect(totals.fiber).toBe(6.5);
  });

  it('meta de fibra: soma do plano quando alguma refeição tem o dado; senão null', () => {
    const withFiber = { fiber: 5 } as never;
    expect(getDailyFiberGoal({ meals: [withFiber, { fiber: 3 } as never] } as never)).toBe(8);
    expect(getDailyFiberGoal({ meals: [{ fiber: null } as never] } as never)).toBeNull();
    expect(getDailyFiberGoal(null)).toBeNull();
  });
});

describe('formatGoalPercent', () => {
  it('sem meta devolve --', () => {
    expect(formatGoalPercent(500, null)).toBe('--');
    expect(formatGoalPercent(500, 0)).toBe('--');
  });
  it('arredonda o percentual', () => {
    expect(formatGoalPercent(847, 1695)).toBe('50%');
  });
  it('999% ainda aparece; acima disso vira 999%+', () => {
    expect(formatGoalPercent(999, 100)).toBe('999%');
    expect(formatGoalPercent(999999, 1695)).toBe('999%+');
  });
  it('negativo vira 0%', () => {
    expect(formatGoalPercent(-10, 100)).toBe('0%');
  });
});

describe('getDayTotals — registro impossível (feedback 27/10)', () => {
  it('999.999 no diário livre não entra no dia', () => {
    const absurd = { calories: 999999, protein: 999999, carbs: 999999, fat: 999999, fiber: 999999 };
    const apple = { calories: 95, protein: 0, carbs: 25, fat: 0, fiber: 4 };
    expect(getDayTotals({ freeMeals: [apple, absurd] })).toEqual({
      calories: 95,
      protein: 0,
      carbs: 25,
      fat: 0,
      fiber: 4,
    });
  });
});

describe('getDayTotals — arredonda o que vai para a tela', () => {
  it('245,7 + 312,4 kcal vira 558; macros com uma casa', () => {
    const a = { calories: 245.7, protein: 30.9, carbs: 0.1, fat: 2.1, fiber: null };
    const b = { calories: 312.4, protein: 2.1, carbs: 0.2, fat: 15.3, fiber: null };
    expect(getDayTotals({ freeMeals: [a, b] })).toEqual({
      calories: 558,
      protein: 33,
      carbs: 0.3,
      fat: 17.4,
      fiber: 0,
    });
  });
});
