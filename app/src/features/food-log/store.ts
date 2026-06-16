import { create } from 'zustand';
import { Meal } from '@shared/services/food-log.service';
import { todayString } from '@shared/utils/date';

interface FoodLogState {
  mealsByDate: Record<string, Meal[]>;
  selectedDate: string;
  isLoading: boolean;
  setSelectedDate: (date: string) => void;
  setMeals: (date: string, meals: Meal[]) => void;
  addMeal: (date: string, meal: Meal) => void;
  removeMeal: (date: string, id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useFoodLogStore = create<FoodLogState>((set) => ({
  mealsByDate: {},
  selectedDate: todayString(),
  isLoading: false,
  setSelectedDate: (date) => set({ selectedDate: date }),
  setMeals: (date, meals) =>
    set((s) => ({ mealsByDate: { ...s.mealsByDate, [date]: meals } })),
  addMeal: (date, meal) =>
    set((s) => ({
      mealsByDate: {
        ...s.mealsByDate,
        [date]: [...(s.mealsByDate[date] ?? []), meal],
      },
    })),
  removeMeal: (date, id) =>
    set((s) => ({
      mealsByDate: {
        ...s.mealsByDate,
        [date]: (s.mealsByDate[date] ?? []).filter((m) => m.id !== id),
      },
    })),
  setLoading: (loading) => set({ isLoading: loading }),
}));
