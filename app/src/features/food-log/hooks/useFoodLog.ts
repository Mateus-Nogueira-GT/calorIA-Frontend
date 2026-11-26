import { useCallback, useEffect, useRef, useState } from 'react';
import { foodLogService, AddMealPayload } from '@shared/services/food-log.service';
import { useFoodLogStore } from '../store';
import { showAlert } from '@shared/utils/show-alert';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

/**
 * R5 (26/11): busca o dia e grava só se a sessão ainda for a mesma. O logout
 * limpa o diário; a resposta da conta anterior não pode repopular o da seguinte.
 */
export function fetchFoodLogDay(date: string, onError: () => void): Promise<void> {
  const owner = captureSessionOwner();
  const store = useFoodLogStore.getState();
  store.setLoading(date, true);
  return foodLogService
    .getMeals(date)
    .then((data) => {
      if (isCurrentOwner(owner)) useFoodLogStore.getState().setMeals(date, data);
    })
    .catch(() => {
      if (isCurrentOwner(owner)) onError();
    })
    .finally(() => {
      if (isCurrentOwner(owner)) useFoodLogStore.getState().setLoading(date, false);
    });
}

export function useFoodLog() {
  const store = useFoodLogStore();
  const meals = store.mealsByDate[store.selectedDate] ?? [];
  const isLoading = store.loadingByDate[store.selectedDate] ?? false;
  const [hasError, setHasError] = useState(false);
  const deletingIds = useRef(new Set<string>());

  useEffect(() => {
    setHasError(false);
    // Portão por syncedDates, não por mealsByDate: escrita local (scanner) cria
    // a chave sem o dia ter sido carregado do servidor — o dia ficava preso com
    // um item só e o resto do diário sumia até reiniciar o app.
    if (store.syncedDates[store.selectedDate]) return;
    fetchFoodLogDay(store.selectedDate, () => setHasError(true));
  }, [store.selectedDate]);

  /** Força o fetch, ignorando o cache — é o retry e o pull-to-refresh. */
  const reload = useCallback(() => {
    setHasError(false);
    return fetchFoodLogDay(store.selectedDate, () => setHasError(true));
  }, [store.selectedDate]);

  const handleAddMeal = useCallback(async (data: AddMealPayload): Promise<void> => {
    // B4: sem a data explícita o serviço usava HOJE, mas o cache local grava sob
    // o dia selecionado. Registrar em "Ontem" parecia funcionar até reabrir o
    // app: a refeição migrava para hoje e os totais dos dois dias ficavam errados.
    const owner = captureSessionOwner();
    const meal = await foodLogService.addMeal({ ...data, date: data.date ?? store.selectedDate });
    if (isCurrentOwner(owner)) store.addMeal(store.selectedDate, meal);
  }, [store.selectedDate]);

  const handleDeleteMeal = useCallback(async (id: string): Promise<void> => {
    // L1: sem catch, uma falha (offline, item já removido) não dizia nada ao
    // usuário e deixava a rejeição pendurada. deletingIds evita o duplo toque
    // na lixeira, que disparava dois DELETEs.
    if (deletingIds.current.has(id)) return;
    deletingIds.current.add(id);
    const owner = captureSessionOwner();
    try {
      await foodLogService.deleteMeal(id);
      if (isCurrentOwner(owner)) store.removeMeal(store.selectedDate, id);
    } catch {
      if (isCurrentOwner(owner)) showAlert('Não foi possível excluir', 'Verifique sua conexão e tente novamente.');
    } finally {
      deletingIds.current.delete(id);
    }
  }, [store.selectedDate]);

  const handleUpdateMeal = useCallback(
    async (id: string, data: Omit<AddMealPayload, 'date'>): Promise<void> => {
      // Erro sobe para o modal, que já mostra "Não foi possível salvar".
      const owner = captureSessionOwner();
      const meal = await foodLogService.updateMeal(id, data);
      if (isCurrentOwner(owner)) store.updateMeal(store.selectedDate, meal);
    },
    [store.selectedDate],
  );

  return {
    meals,
    isLoading,
    hasError,
    reload,
    selectedDate: store.selectedDate,
    setSelectedDate: store.setSelectedDate,
    handleAddMeal,
    handleDeleteMeal,
    handleUpdateMeal,
  };
}
