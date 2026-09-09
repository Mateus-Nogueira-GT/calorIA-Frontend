import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';
import { useDietStore } from '@features/diet/store';

/**
 * DietPlanSection chama useNavigation. No app o dashboard está dentro do tab
 * navigator; o teste precisa do mesmo contexto, senão quebra em
 * "Couldn't find a navigation object".
 */
function renderDashboard() {
  return render(
    <NavigationContainer>
      <DashboardScreen />
    </NavigationContainer>,
  );
}

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString(), mealType: 'other' },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, syncedDates: {}, loadingByDate: {}, selectedDate: '2026-06-09' });
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Joao', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
  useDietStore.setState({ plan: null, isLoading: false, togglingMealId: null });
});

describe('DashboardScreen', () => {
  it('renderiza saudacao com o nome do usuario', () => {
    const { getByText } = renderDashboard();
    expect(getByText(/Joao/)).toBeTruthy();
  });

  it('exibe refeicoes do dia apos carregamento', async () => {
    const { findByText } = renderDashboard();
    expect(await findByText('Frango')).toBeTruthy();
  });

  /**
   * R5: sem plano, o Dashboard caía em constantes do cliente
   * (2000 kcal / 150g / 250g / 65g) e as exibia como metas pessoais. O print do
   * cliente mostrava exatamente esses quatro números.
   */
  it('sem dieta gerada não inventa meta nenhuma (R5)', () => {
    useDietStore.setState({ plan: null, isLoading: false, togglingMealId: null });
    const { queryByText, getAllByText } = renderDashboard();

    for (const chute of ['2000', '150g', '250g', '65g', 'de 2000 kcal']) {
      expect(queryByText(chute)).toBeNull();
    }
    expect(getAllByText('Sem meta ainda').length).toBeGreaterThan(0);
  });

  it('exibe a secao de diario alimentar', () => {
    const { getByText } = renderDashboard();
    expect(getByText('Diario alimentar')).toBeTruthy();
  });
});
