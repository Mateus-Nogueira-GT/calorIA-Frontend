import { useCallback, useEffect, useRef, useState } from 'react';
import { foodLogService, AddMealPayload } from '@shared/services/food-log.service';
import { useFoodLogStore } from '../store';
import { showAlert } from '@shared/utils/show-alert';

export function useFoodLog() {
  const store = useFoodLogStore();
  const meals = store.mealsByDate[store.selectedDate] ?? [];
  const isLoading = store.loadingByDate[store.selectedDate] ?? false;
  const [hasError, setHasError] = useState(false);
  const deletingIds = useRef(new Set<string>());

  useEffect(() => {
    setHasError(false);
    if (store.mealsByDate[store.selectedDate] !== undefined) return;
    store.setLoading(store.selectedDate, true);
    foodLogService
      .getMeals(store.selectedDate)
      .then((data) => store.setMeals(store.selectedDate, data))
      .catch(() => { setHasError(true); })
      .finally(() => store.setLoading(store.selectedDate, false));
  }, [store.selectedDate]);

  const reload = useCallback(() => {
    setHasError(false);
    store.setLoading(store.selectedDate, true);
    foodLogService
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
    // L1: sem catch, uma falha (offline, item já removido) não dizia nada ao
    // usuário e deixava a rejeição pendurada. deletingIds evita o duplo toque
    // na lixeira, que disparava dois DELETEs.
    if (deletingIds.current.has(id)) return;
    deletingIds.current.add(id);
    try {
      await foodLogService.deleteMeal(id);
      store.removeMeal(store.selectedDate, id);
    } catch {
      showAlert('Não foi possível excluir', 'Verifique sua conexão e tente novamente.');
    } finally {
      deletingIds.current.delete(id);
    }
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
