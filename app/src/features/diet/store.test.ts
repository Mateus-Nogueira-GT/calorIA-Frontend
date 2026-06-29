import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useDietStore } from './store';
import type { DietPlan, PlannedMeal } from '@shared/services/diet.service';

const meal = (id: string, completedAt: string | null = null): PlannedMeal => ({
  id,
  type: 'breakfast',
  title: 'Café',
  suggestedTime: '08:00',
  items: [],
  calories: 400,
  protein: 20,
  carbs: 50,
  fat: 10,
  completedAt,
});

const plan: DietPlan = {
  id: 'p1',
  date: '2026-06-11',
  meals: [meal('m1'), meal('m2', '2026-06-11T08:00:00Z')],
  totalCalories: 800,
  totalProtein: 40,
  totalCarbs: 100,
  totalFat: 20,
  generatedAt: '2026-06-11T07:00:00Z',
};

jest.mock('@shared/services/diet.service', () => ({
  dietService: {
    getToday: jest.fn(),
    toggleMeal: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dietService } = require('@shared/services/diet.service');

describe('useDietStore', () => {
  beforeEach(() => {
    useDietStore.setState({
      plan: undefined,
      isLoading: false,
      togglingMealId: null,
    });
    jest.clearAllMocks();
  });

  it('loadCurrent popula o plan', async () => {
    dietService.getToday.mockResolvedValue(plan);
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.loadCurrent());
    expect(result.current.plan).toEqual(plan);
    expect(result.current.isLoading).toBe(false);
  });

  it('loadCurrent aceita null (sem dieta)', async () => {
    dietService.getToday.mockResolvedValue(null);
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.loadCurrent());
    expect(result.current.plan).toBeNull();
  });

  it('toggleMealComplete aplica otimista e confirma com a resposta', async () => {
    dietService.toggleMeal.mockResolvedValue({ is_completed: true });
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.toggleMealComplete('m1'));
    expect(result.current.plan?.meals[0].completedAt).toBeTruthy();
    expect(result.current.togglingMealId).toBeNull();
  });

  it('toggleMealComplete reverte em caso de erro', async () => {
    dietService.toggleMeal.mockRejectedValue(new Error('fail'));
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(async () => {
      try {
        await result.current.toggleMealComplete('m1');
      } catch {
        /* expected */
      }
    });
    expect(result.current.plan?.meals[0].completedAt).toBeNull();
    expect(result.current.togglingMealId).toBeNull();
  });

  it('toggleMealComplete desmarca quando a refeição já estava concluída', async () => {
    dietService.toggleMeal.mockResolvedValue({ is_completed: false });
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.toggleMealComplete('m2'));
    expect(dietService.toggleMeal).toHaveBeenCalledWith('m2');
    expect(result.current.plan?.meals[1].completedAt).toBeNull();
  });

  it('clear zera o estado', () => {
    useDietStore.setState({ plan });
    useDietStore.getState().clear();
    expect(useDietStore.getState().plan).toBeUndefined();
  });
});
