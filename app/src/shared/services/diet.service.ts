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
  getCurrent: () =>
    api.get<DietPlan | null>('/diet/current').then((r) => r.data),
  generate: () =>
    api.post<DietPlan>('/diet/generate').then((r) => r.data),
  completeMeal: (mealId: string) =>
    api.patch<PlannedMeal>(`/diet/meals/${mealId}/complete`).then((r) => r.data),
  uncompleteMeal: (mealId: string) =>
    api.patch<PlannedMeal>(`/diet/meals/${mealId}/uncomplete`).then((r) => r.data),
};
