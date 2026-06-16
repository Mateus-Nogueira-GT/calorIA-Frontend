import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'João', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('DashboardScreen', () => {
  it('renderiza saudação com o nome do usuário', () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText(/João/)).toBeTruthy();
  });

  it('exibe refeições do dia após carregamento', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });

  it('exibe label REFEIÇÕES DE HOJE', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('REFEIÇÕES DE HOJE')).toBeTruthy();
  });
});
