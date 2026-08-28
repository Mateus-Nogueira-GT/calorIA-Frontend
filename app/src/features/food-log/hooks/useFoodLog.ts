import { useCallback, useEffect, useState } from 'react';
import { foodLogService, AddMealPayload } from '@shared/services/food-log.service';
import { useFoodLogStore } from '../store';

export function useFoodLog() {
  const store = useFoodLogStore();
  const meals = store.mealsByDate[store.selectedDate] ?? [];
  const isLoading = store.loadingByDate[store.selectedDate] ?? false;
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    // Portão por syncedDates, não por mealsByDate: escrita local (scanner) cria
    // a chave sem o dia ter sido carregado do servidor — o dia ficava preso com
    // um item só e o resto do diário sumia até reiniciar o app.
    if (store.syncedDates[store.selectedDate]) return;
    store.setLoading(store.selectedDate, true);
    foodLogService
      .getMeals(store.selectedDate)
      .then((data) => store.setMeals(store.selectedDate, data))
      .catch(() => { setHasError(true); })
      .finally(() => store.setLoading(store.selectedDate, false));
  }, [store.selectedDate]);

  /** Força o fetch, ignorando o cache — é o retry e o pull-to-refresh. */
  const reload = useCallback(() => {
    setHasError(false);
    store.setLoading(store.selectedDate, true);
    return foodLogService
      .getMeals(store.selectedDate)
      .then((data) => store.setMeals(store.selectedDate, data))
      .catch(() => { setHasError(true); })
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
    hasError,
    reload,
    selectedDate: store.selectedDate,
    setSelectedDate: store.setSelectedDate,
    handleAddMeal,
    handleDeleteMeal,
  };
}
