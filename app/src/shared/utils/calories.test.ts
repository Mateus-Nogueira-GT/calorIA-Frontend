import { describe, it, expect } from '@jest/globals';
import { getDailyCalorieGoal, sumCalories, DEFAULT_CALORIE_GOAL } from './calories';
import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

const plan = (totalCalories: number): DietPlan => ({
  id: 'p', date: '2026-06-25', meals: [], totalCalories, totalProtein: 0, totalCarbs: 0, totalFat: 0, generatedAt: '2026-06-25T00:00:00Z',
});
const meal = (calories: number): Meal => ({ id: 'm', name: 'x', calories, protein: 0, carbs: 0, fat: 0, loggedAt: '2026-06-25T08:00:00Z' });

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
