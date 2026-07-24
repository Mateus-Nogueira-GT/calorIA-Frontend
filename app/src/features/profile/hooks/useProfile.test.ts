import { renderHook, waitFor } from '@testing-library/react-native';
import { useProfile } from './useProfile';
import { useAuthStore } from '@features/auth/store';
import { dateToString } from '@shared/utils/date';

// G4: o gráfico semanal usa 1 request agregado (getSummary) no lugar de 7.
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getSummary: jest.fn().mockImplementation(() =>
      Promise.resolve([
        { date: require('@shared/utils/date').todayString(), calories: 450, protein: 38, carbs: 52, fat: 8 },
      ]),
    ),
  },
}));

// G5: o streak exibido no perfil é o canônico do backend (tabela streaks).
jest.mock('@shared/services/profile.service', () => ({
  profileService: {
    getMe: jest.fn().mockResolvedValue({
      id: '1',
      username: 'joao',
      full_name: 'João',
      avatar_url: null,
      avatar_emoji: null,
      current_streak: 3,
    }),
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

  it('carrega weeklyData com 7 entradas em 1 request (dias sem registro = 0)', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weeklyData).toHaveLength(7);
    const today = dateToString(new Date());
    const todayEntry = result.current.weeklyData.find((d) => d.date === today);
    expect(todayEntry?.calories).toBe(450);
    expect(result.current.weeklyData.filter((d) => d.calories === 0)).toHaveLength(6);
  });

  it('usa o streak canônico do backend (não recalcula localmente)', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.streak).toBe(3));
  });
});
