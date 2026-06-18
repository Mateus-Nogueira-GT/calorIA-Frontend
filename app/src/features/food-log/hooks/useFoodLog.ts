import { useCallback, useEffect } from 'react';
import { foodLogService, AddMealPayload } from '@shared/services/food-log.service';
import { useFoodLogStore } from '../store';

export function useFoodLog() {
  const store = useFoodLogStore();
  const meals = store.mealsByDate[store.selectedDate] ?? [];
  const isLoading = store.loadingByDate[store.selectedDate] ?? false;

  useEffect(() => {
    if (store.mealsByDate[store.selectedDate] !== undefined) return;
    store.setLoading(store.selectedDate, true);
    foodLogService
      .getMeals(store.selectedDate)
      .then((data) => store.setMeals(store.selectedDate, data))
      .catch(() => {})
      .finally(() => store.setLoading(store.selectedDate, false));
  }, [store.selectedDate]);

  const handleAddMeal = useCallback(async (data: AddMealPayload): Promise<void> => {
    const meal = await foodLogService.addMeal(data);
    store.addMeal(store.selectedDate, meal);
  }, [store.selectedDate]);

  const handleDeleteMeal = useCallback(async (id: string): Promise<void> => {
    await foodLogService.deleteMeal(id);
    store.removeMeal(store.selectedDate, id);
  }, [store.selectedDate]);

  return {
    meals,
    isLoading,
    selectedDate: store.selectedDate,
    setSelectedDate: store.setSelectedDate,
    handleAddMeal,
    handleDeleteMeal,
  };
}
