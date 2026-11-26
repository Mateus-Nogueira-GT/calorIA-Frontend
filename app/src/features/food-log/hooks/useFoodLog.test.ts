import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFoodLog } from './useFoodLog';
import { useFoodLogStore } from '../store';

const mockMeal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString(), mealType: 'other' as const };
const mockNewMeal = { id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString(), mealType: 'other' as const };

jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

  it('avisa quando excluir falha e mantém a refeição na lista (L1)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  it('envia a data SELECIONADA ao registrar (B4)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    // Usuário no chip "Ontem": sem a data explícita o servidor salvava em HOJE
    // enquanto o cache local gravava em ontem — a refeição migrava de dia.
    useFoodLogStore.setState({ mealsByDate: { '2026-06-08': [] }, loadingByDate: {}, selectedDate: '2026-06-08' });
    const { result } = renderHook(() => useFoodLog());

    await act(async () => {
      await result.current.handleAddMeal({ name: 'Almoço', calories: 500, protein: 30, carbs: 40, fat: 10 });
    });

    expect(foodLogService.addMeal).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-08' }),
    );
  });

  it('respeita uma data explícita passada pelo chamador', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ mealsByDate: { '2026-06-09': [] }, loadingByDate: {}, selectedDate: '2026-06-09' });
    const { result } = renderHook(() => useFoodLog());

    await act(async () => {
      await result.current.handleAddMeal({ name: 'X', calories: 1, protein: 0, carbs: 0, fat: 0, date: '2026-06-01' });
    });

    expect(foodLogService.addMeal).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-06-01' }),
    );
  });
});
describe('useFoodLog — troca de conta com a requisição pendente (R5, 26/11)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require('@features/auth/store');
  const signIn = (id: string) => {
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken(`token-${id}`, { id, name: id, email: `${id}@exemplo.com` });
  };
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => {
      resolve = a;
      reject = b;
    });
    return { promise, resolve, reject };
  };
  const today = () => useFoodLogStore.getState().selectedDate;
  beforeEach(() => {
    signIn('uA');
    jest.clearAllMocks();
  });

  it('refeições do dia carregadas para a conta anterior não entram no diário da próxima', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    const pending = deferred<unknown[]>();
    foodLogService.getMeals.mockReturnValue(pending.promise);
    renderHook(() => useFoodLog());
    await act(async () => {});
    act(() => signIn('uB'));
    await act(async () => {
      pending.resolve([mockMeal]);
    });
    const state = useFoodLogStore.getState();
    expect(state.mealsByDate).toEqual({});
    expect(state.syncedDates).toEqual({});
    expect(state.loadingByDate).toEqual({});
  });

  it('refeição adicionada pela conta anterior não entra no diário da próxima', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ syncedDates: { [today()]: true }, mealsByDate: { [today()]: [] } });
    const { result } = renderHook(() => useFoodLog());
    const pending = deferred<unknown>();
    foodLogService.addMeal.mockReturnValue(pending.promise);
    let adding!: Promise<void>;
    act(() => {
      adding = result.current.handleAddMeal({ name: 'x' } as never);
    });
    act(() => signIn('uB'));
    await act(async () => {
      pending.resolve(mockNewMeal);
      await adding;
    });
    expect(useFoodLogStore.getState().mealsByDate).toEqual({});
  });

  it('falha ao excluir pela conta anterior não avisa a próxima', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ syncedDates: { [today()]: true }, mealsByDate: { [today()]: [mockMeal] } });
    const { result } = renderHook(() => useFoodLog());
    const pending = deferred<unknown>();
    foodLogService.deleteMeal.mockReturnValue(pending.promise);
    let deleting!: Promise<void>;
    act(() => {
      deleting = result.current.handleDeleteMeal('m1');
    });
    act(() => signIn('uB'));
    await act(async () => {
      pending.reject(new Error('cancelada'));
      await deleting;
    });
    expect(showAlert).not.toHaveBeenCalled();
    expect(useFoodLogStore.getState().mealsByDate).toEqual({});
  });
});
