import api from './api';
import { todayString } from '@shared/utils/date';

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
}

export interface AddMealPayload {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Data local do registro (YYYY-MM-DD). Default: hoje local. */
  date?: string;
}

export const foodLogService = {
  getMeals: (date: string) =>
    api.get<Meal[]>('/food-log', { params: { date } }).then((r) => r.data),
  // Sempre envia a data LOCAL — sem ela o servidor grava CURRENT_DATE (UTC),
  // que às 21h BRT já é "amanhã" e a refeição sumia da lista do dia.
  addMeal: (data: AddMealPayload) =>
    api.post<Meal>('/food-log', { ...data, date: data.date ?? todayString() }).then((r) => r.data),
  deleteMeal: (id: string) =>
    api.delete(`/food-log/${id}`).then((r) => r.data),
};
