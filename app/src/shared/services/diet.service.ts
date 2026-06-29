// src/shared/services/diet.service.ts
import api from './api';

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface MealItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
}

export interface PlannedMeal {
  id: string;
  type: MealType;
  title: string;
  suggestedTime: string;
  items: MealItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  completedAt: string | null;
}

export interface DietPlan {
  id: string;
  date: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  generatedAt: string;
}

export const dietService = {
  /** Dia atual da dieta (refeições + metas) — dado principal do dashboard. */
  getToday: () => api.get<DietPlan | null>('/diets/today').then((r) => r.data),
  toggleMeal: (mealId: string) =>
    api.patch<{ is_completed: boolean }>(`/diets/meals/${mealId}/toggle`).then((r) => r.data),
};
