import React from 'react';
import { render, act } from '@testing-library/react-native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';
import { useDietStore } from '@features/diet/store';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, loadingByDate: {}, selectedDate: '2026-06-09' });
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Joao', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
  useDietStore.setState({ plan: null, isLoading: false, togglingMealId: null });
});

describe('DashboardScreen', () => {
  it('renderiza saudacao com o nome do usuario', async () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText(/Joao/)).toBeTruthy();
    await act(async () => {});
  });

  it('exibe refeicoes do dia apos carregamento', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });

  it('exibe a secao de diario alimentar', async () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText('Diário alimentar')).toBeTruthy();
    await act(async () => {});
  });
});
