import api from './api';

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export const weightService = {
  getHistory: () => api.get<WeightEntry[]>('/weight').then((r) => r.data),
  addEntry: (weightKg: number, date: string) =>
    api.post<WeightEntry>('/weight', { weightKg, date }).then((r) => r.data),
};
