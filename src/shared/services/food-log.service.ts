import api from './api';

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
}

export const foodLogService = {
  getMeals: (date: string) =>
    api.get<Meal[]>('/food-log', { params: { date } }).then((r) => r.data),
  addMeal: (data: AddMealPayload) =>
    api.post<Meal>('/food-log', data).then((r) => r.data),
  deleteMeal: (id: string) =>
    api.delete(`/food-log/${id}`).then((r) => r.data),
};
