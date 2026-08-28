import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFoodLog } from './useFoodLog';
import { useFoodLogStore } from '../store';

const mockMeal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };
const mockNewMeal = { id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString() };

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
  useFoodLogStore.setState({ mealsByDate: {}, syncedDates: {}, loadingByDate: {}, selectedDate: '2026-06-09' });
});

describe('useFoodLog', () => {
  it('carrega refeições ao montar', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    expect(result.current.meals[0].name).toBe('Frango');
  });

  it('não faz fetch se a data já está em cache', async () => {
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ mealsByDate: { '2026-06-09': [mockMeal] }, syncedDates: { '2026-06-09': true }, loadingByDate: {}, selectedDate: '2026-06-09' });
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
});
