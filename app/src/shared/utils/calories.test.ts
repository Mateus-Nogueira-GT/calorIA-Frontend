import { describe, it, expect } from '@jest/globals';
import { getDailyCalorieGoal, sumCalories, getDayTotals, DEFAULT_CALORIE_GOAL } from './calories';
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
  it('usa o default quando não há plano', () => {
    expect(getDailyCalorieGoal(null)).toBe(DEFAULT_CALORIE_GOAL);
    expect(getDailyCalorieGoal(undefined)).toBe(DEFAULT_CALORIE_GOAL);
  });
  it('usa o default quando o plano tem 0 calorias', () => {
    expect(getDailyCalorieGoal(plan(0))).toBe(DEFAULT_CALORIE_GOAL);
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
    expect(totals).toEqual({ calories: 800, protein: 11, carbs: 22, fat: 8 });
  });

  it('dia vazio zera tudo', () => {
    expect(getDayTotals({ planMeals: [], freeMeals: [] })).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});
