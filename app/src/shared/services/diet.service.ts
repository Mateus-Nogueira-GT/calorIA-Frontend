// src/shared/services/diet.service.ts
import api from './api';
import { todayDayNumber, todayString, tzOffsetMinutes } from '@shared/utils/date';

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
  /** Concluída NO dia local consultado — é o campo que a UI deve ler. */
  completedToday: boolean;
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
  /**
   * Dia atual da dieta (refeições + metas) — dado principal do dashboard.
   * Envia o dia/data/fuso LOCAIS: sem isso o servidor (UTC) "vira o dia"
   * às 21h BRT e o completedToday não reflete o dia do usuário.
   */
  getToday: () =>
    api
      .get<DietPlan | null>('/diets/today', {
        params: {
          dayNumber: todayDayNumber(),
          date: todayString(),
          tzOffsetMinutes: tzOffsetMinutes(),
        },
      })
      .then((r) => r.data),
  /**
   * O fuso vai junto com a data: o servidor decide se a refeição já está
   * concluída NAQUELE dia local. Sem tzOffsetMinutes ele compara em UTC e o
   * dia "vira" às 21h BRT (mesmo motivo do getToday acima).
   */
  toggleMeal: (mealId: string) =>
    api
      .patch<{ is_completed: boolean }>(`/diets/meals/${mealId}/toggle`, {
        date: todayString(),
        tzOffsetMinutes: tzOffsetMinutes(),
      })
      .then((r) => r.data),
  /** Geração assíncrona: cada chamada gera 1 dia; chamar em polling até completed. */
  stepJob: (jobId: string) =>
    // Gerar 1 dia via GPT-5 pode passar de 1 min — timeout bem acima do padrão.
    // Body {} explícito: POST com Content-Type json e body vazio é rejeitado pelo Fastify.
    api.post<DietJobStatus>(`/diets/jobs/${jobId}/step`, {}, { timeout: 150000 }).then((r) => r.data),
  getJob: (jobId: string) => api.get<DietJobStatus>(`/diets/jobs/${jobId}`).then((r) => r.data),
  /** Reabre um job failed — o /step continua do dia em que parou. */
  retryJob: (jobId: string) =>
    api.post<DietJobStatus>(`/diets/jobs/${jobId}/retry`, {}).then((r) => r.data),
  /**
   * Job pending/running mais recente — usado no boot para RETOMAR uma geração
   * interrompida (app fechado no meio). null quando não há job em andamento.
   */
  getActiveJob: () =>
    api
      .get<DietJobStatus>('/diets/jobs/active')
      .then((r) => r.data)
      .catch(() => null),
};
