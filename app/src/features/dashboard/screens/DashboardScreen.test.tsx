import React from 'react';
import { render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';
import { todayString } from '@shared/utils/date';
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
      {
        id: 'm1',
        name: 'Frango',
        calories: 450,
        protein: 38,
        carbs: 52,
        fat: 8,
        loggedAt: new Date().toISOString(),
        mealType: 'other',
      },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({
    mealsByDate: {},
    syncedDates: {},
    loadingByDate: {},
    selectedDate: '2026-06-09',
  });
  useAuthStore.setState({
    token: 'tok',
    user: { id: '1', name: 'Joao', email: 'j@j.com' },
    isAuthenticated: true,
    pendingAuth: null,
  });
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
    expect(getByText('Diário alimentar')).toBeTruthy();
  });
});

// Contratos de layout: não substituem captura/medição do iPhone real.
describe('DashboardScreen — área segura e fonte ampliada', () => {
  afterEach(() => jest.restoreAllMocks());

  it('protege o topo/laterais sem duplicar o inset da tab bar', () => {
    const { UNSAFE_getByType } = renderDashboard();
    expect(UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['top', 'left', 'right']);
  });

  it('empilha resumo e macros quando a fonte exige mais largura', () => {
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 2 });
    const { getByTestId } = renderDashboard();
    expect(
      StyleSheet.flatten(getByTestId('dashboard-calorie-summary').props.style).flexDirection,
    ).toBe('column');
    expect(StyleSheet.flatten(getByTestId('macro-card-Proteína').props.style).flexBasis).toBe(
      '100%',
    );
  });
});

it('calorias de cinco dígitos têm a largura da seção, sem competir com o anel', () => {
  const date = todayString();
  useFoodLogStore.setState({
    mealsByDate: {
      [date]: [
        {
          id: 'large',
          mealType: 'other',
          name: 'Refeição',
          calories: 12345,
          protein: 0,
          carbs: 0,
          fat: 0,
          loggedAt: new Date().toISOString(),
        },
      ],
    },
    syncedDates: { [date]: true },
  });
  const { getByTestId, getByText } = renderDashboard();
  expect(getByText('12345')).toBeTruthy();
  expect(
    StyleSheet.flatten(getByTestId('dashboard-calorie-summary').props.style).flexDirection,
  ).toBe('column');
});

it('total com decimal (450.5) não conta como número longo', () => {
  const date = todayString();
  useFoodLogStore.setState({
    mealsByDate: {
      [date]: [
        {
          id: 'decimal',
          mealType: 'other',
          name: 'Refeição',
          calories: 450.5,
          protein: 0,
          carbs: 0,
          fat: 0,
          loggedAt: new Date().toISOString(),
        },
      ],
    },
    syncedDates: { [date]: true },
  });
  const { getByTestId } = renderDashboard();
  expect(
    StyleSheet.flatten(getByTestId('dashboard-calorie-summary').props.style).flexDirection,
  ).not.toBe('column');
});
