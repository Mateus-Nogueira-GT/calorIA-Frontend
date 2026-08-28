import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFoodLog } from './useFoodLog';
import { useFoodLogStore } from '../store';

const mockMeal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };
const mockNewMeal = { id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString() };

jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { showAlert } = require('@shared/utils/show-alert');

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn(),
    addMeal: jest.fn(),
    deleteMeal: jest.fn(),
  },
}));

beforeEach(() => {
  const { foodLogService } = require('@shared/services/food-log.service');
  foodLogService.getMeals.mockResolvedValue([mockMeal]);
  foodLogService.addMeal.mockResolvedValue(mockNewMeal);
  foodLogService.deleteMeal.mockResolvedValue({ deleted: true });
  jest.clearAllMocks();
  foodLogService.getMeals.mockResolvedValue([mockMeal]);
  foodLogService.addMeal.mockResolvedValue(mockNewMeal);
  foodLogService.deleteMeal.mockResolvedValue({ deleted: true });
  useFoodLogStore.setState({ mealsByDate: {}, loadingByDate: {}, selectedDate: '2026-06-09' });
});

describe('useFoodLog', () => {
  it('carrega refeições ao montar', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    expect(result.current.meals[0].name).toBe('Frango');
  });

  it('não faz fetch se a data já está em cache', async () => {
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ mealsByDate: { '2026-06-09': [mockMeal] }, loadingByDate: {}, selectedDate: '2026-06-09' });
    renderHook(() => useFoodLog());
    await act(async () => {});
    expect(foodLogService.getMeals).not.toHaveBeenCalled();
  });

  it('handleAddMeal adiciona refeição ao store', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    await act(() => result.current.handleAddMeal({ name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5 }));
    expect(result.current.meals).toHaveLength(2);
  });

  it('handleDeleteMeal remove refeição do store', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    await act(() => result.current.handleDeleteMeal('m1'));
    expect(result.current.meals).toHaveLength(0);
  });

  it('avisa quando excluir falha e mantém a refeição na lista (L1)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { foodLogService } = require('@shared/services/food-log.service');
    foodLogService.deleteMeal.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));

    await act(() => result.current.handleDeleteMeal('m1'));

    // Sem catch, a falha era silenciosa e a rejeição ficava pendurada.
    expect(showAlert).toHaveBeenCalled();
    expect(result.current.meals).toHaveLength(1);
  });

  it('ignora o segundo toque na lixeira do mesmo item (L1)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { foodLogService } = require('@shared/services/food-log.service');
    foodLogService.deleteMeal.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ deleted: true }), 10)),
    );
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));

    await act(async () => {
      await Promise.all([
        result.current.handleDeleteMeal('m1'),
        result.current.handleDeleteMeal('m1'),
      ]);
    });

    expect(foodLogService.deleteMeal).toHaveBeenCalledTimes(1);
  });
});