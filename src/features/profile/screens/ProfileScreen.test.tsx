import React from 'react';
import { render } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import { useAuthStore } from '@features/auth/store';
import { useProfile } from '../hooks/useProfile';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../hooks/useProfile');

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Maria', email: 'm@m.com' }, isAuthenticated: true, pendingAuth: null });
  (useProfile as jest.Mock).mockReturnValue({
    user: { id: '1', name: 'Maria Oliveira', email: 'm@m.com' },
    weeklyData: [
      { date: '2026-06-10', label: 'Qua', calories: 0 },
      { date: '2026-06-11', label: 'Qui', calories: 380 },
      { date: '2026-06-12', label: 'Sex', calories: 520 },
      { date: '2026-06-13', label: 'Sab', calories: 430 },
      { date: '2026-06-14', label: 'Dom', calories: 610 },
      { date: '2026-06-15', label: 'Seg', calories: 700 },
      { date: '2026-06-16', label: 'Ter', calories: 640 },
    ],
    streak: 3,
    loading: false,
    handleLogout: jest.fn(),
  });
});

describe('ProfileScreen', () => {
  it('renderiza o nome do usuário', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('Maria Oliveira')).toBeTruthy();
  });

  it('renderiza o botão de sair', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    expect(await findByTestId('logout-btn')).toBeTruthy();
  });

  it('renderiza a secao de progresso semanal', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('Esta semana')).toBeTruthy();
    expect(await findByText('Media diaria')).toBeTruthy();
  });
});
