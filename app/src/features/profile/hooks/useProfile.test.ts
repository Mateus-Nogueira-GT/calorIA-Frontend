import { renderHook, waitFor } from '@testing-library/react-native';
import { useProfile } from './useProfile';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'João', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('useProfile', () => {
  it('retorna o usuário do auth store', () => {
    const { result } = renderHook(() => useProfile());
    expect(result.current.user?.name).toBe('João');
  });

  it('carrega weeklyData com 7 entradas', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weeklyData).toHaveLength(7);
  });

  it('calcula streak > 0 quando há refeições', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streak).toBeGreaterThan(0);
  });
});
