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

export interface DietJobStatus {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  daysCompleted: number;
  totalDays: number;
  dietId: string | null;
  error: string | null;
}

export const dietService = {
  /** Dia atual da dieta (refeições + metas) — dado principal do dashboard. */
  getToday: () => api.get<DietPlan | null>('/diets/today').then((r) => r.data),
  toggleMeal: (mealId: string) =>
    api.patch<{ is_completed: boolean }>(`/diets/meals/${mealId}/toggle`).then((r) => r.data),
  /** Geração assíncrona: cada chamada gera 1 dia; chamar em polling até completed. */
  stepJob: (jobId: string) =>
    // Gerar 1 dia via GPT-5 pode passar de 1 min — timeout bem acima do padrão.
    // Body {} explícito: POST com Content-Type json e body vazio é rejeitado pelo Fastify.
    api.post<DietJobStatus>(`/diets/jobs/${jobId}/step`, {}, { timeout: 150000 }).then((r) => r.data),
  getJob: (jobId: string) => api.get<DietJobStatus>(`/diets/jobs/${jobId}`).then((r) => r.data),
};
