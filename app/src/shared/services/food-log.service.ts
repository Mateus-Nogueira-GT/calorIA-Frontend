import api from './api';
import { todayString } from '@shared/utils/date';

export type AppMealType = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'other';

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
  mealType: AppMealType;
}

export interface AddMealPayload {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Data local do registro (YYYY-MM-DD). Default: hoje local. */
  date?: string;
  /** Tipo da refeição — 'other' cai no agrupamento por horário. */
  mealType?: AppMealType;
}

export interface DaySummary {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const foodLogService = {
  getMeals: (date: string) =>
    api.get<Meal[]>('/food-log', { params: { date } }).then((r) => r.data),
  /** Totais por dia no intervalo (1 request) — dias sem registro não voltam. */
  getSummary: (from: string, to: string) =>
    api.get<DaySummary[]>('/food-log/summary', { params: { from, to } }).then((r) => r.data),
  // Sempre envia a data LOCAL — sem ela o servidor grava CURRENT_DATE (UTC),
  // que às 21h BRT já é "amanhã" e a refeição sumia da lista do dia.
  addMeal: (data: AddMealPayload) =>
    api.post<Meal>('/food-log', { ...data, date: data.date ?? todayString() }).then((r) => r.data),
  deleteMeal: (id: string) =>
    api.delete(`/food-log/${id}`).then((r) => r.data),
};
