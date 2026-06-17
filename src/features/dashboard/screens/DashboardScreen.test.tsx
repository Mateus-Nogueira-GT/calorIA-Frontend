import React from 'react';
import { render } from '@testing-library/react-native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';
import { useDietStore } from '@features/diet/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Joao', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
  useDietStore.setState({ plan: null, isLoading: false, isGenerating: false, togglingMealId: null });
});

describe('DashboardScreen', () => {
  it('renderiza saudacao com o nome do usuario', () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText(/Joao/)).toBeTruthy();
  });

  it('exibe refeicoes do dia apos carregamento', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });

  it('exibe a secao de diario alimentar', () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText('Diario alimentar')).toBeTruthy();
  });
});
