import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import { FoodLogScreen } from './FoodLogScreen';
import { useFoodLogStore } from '../store';
import { todayString } from '@shared/utils/date';

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
      },
    ]),
    addMeal: jest.fn().mockResolvedValue({
      id: 'm2',
      name: 'Novo',
      calories: 300,
      protein: 20,
      carbs: 30,
      fat: 5,
      loggedAt: new Date().toISOString(),
    }),
    deleteMeal: jest.fn().mockResolvedValue({ deleted: true }),
    updateMeal: jest.fn().mockResolvedValue({
      id: 'm1',
      name: 'Frango grelhado',
      calories: 400,
      protein: 38,
      carbs: 52,
      fat: 8,
      fiber: 3,
      loggedAt: new Date().toISOString(),
      mealType: 'lunch',
    }),
  },
}));

let mockPlan: unknown = null;
jest.mock('@features/diet/store', () => ({
  useDietStore: (selector: (s: { plan: unknown }) => unknown) => selector({ plan: mockPlan }),
}));

beforeEach(() => {
  mockPlan = null;
  useFoodLogStore.setState({
    mealsByDate: {},
    syncedDates: {},
    loadingByDate: {},
    selectedDate: '2026-06-09',
  });
});

describe('FoodLogScreen', () => {
  it('renderiza o titulo e o CTA principal', async () => {
    const { getByText } = render(<FoodLogScreen />);
    expect(getByText('Diário alimentar')).toBeTruthy();
    expect(getByText('Adicionar refeição')).toBeTruthy();
    await act(async () => {}); // drena o load assíncrono do useFoodLog
  });

  it('exibe "Hoje" como chip selecionado', async () => {
    const { getAllByText } = render(<FoodLogScreen />);
    expect(getAllByText('Hoje').length).toBeGreaterThan(0);
    await act(async () => {}); // drena o load assíncrono do useFoodLog
  });

  it('exibe refeicoes apos carregamento', async () => {
    const { findByText } = render(<FoodLogScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });

  it('Editar abre o modal preenchido e salva pela rota de edição', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    const { findByTestId, getByText, getByTestId, findByText } = render(<FoodLogScreen />);
    fireEvent.press(await findByTestId('edit-m1'));
    expect(getByText('Editar refeição')).toBeTruthy();
    fireEvent.changeText(getByTestId('meal-name-input'), 'Frango grelhado');
    fireEvent.press(getByText('Salvar alterações'));
    await waitFor(() =>
      expect(foodLogService.updateMeal).toHaveBeenCalledWith(
        'm1',
        expect.objectContaining({ name: 'Frango grelhado', calories: 450 }),
      ),
    );
    expect(foodLogService.updateMeal.mock.calls[0][1]).not.toHaveProperty('date');
    expect(await findByText('Frango grelhado')).toBeTruthy();
  });
});

it('FoodLog: protege topo e laterais sem inset inferior duplicado', async () => {
  const { UNSAFE_getByType } = render(<FoodLogScreen />);
  expect(UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['top', 'left', 'right']);
  await waitFor(() => expect(UNSAFE_getByType(SafeAreaView)).toBeTruthy());
});

it('Resumo nutricional soma as refeições do plano concluídas, como a barra (S4)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { foodLogService } = require('@shared/services/food-log.service');
  foodLogService.getMeals.mockResolvedValueOnce([
    { id: 'f1', name: 'Fruta', calories: 100, protein: 1, carbs: 25, fat: 0, loggedAt: new Date().toISOString() },
  ]);
  mockPlan = {
    id: 'd1',
    date: todayString(),
    meals: [
      {
        id: 'pm1', type: 'lunch', title: 'Almoço', suggestedTime: '12:00', items: [],
        calories: 500, protein: 40, carbs: 50, fat: 10, completedAt: new Date().toISOString(), completedToday: true,
      },
      {
        id: 'pm2', type: 'dinner', title: 'Jantar', suggestedTime: '20:00', items: [],
        calories: 700, protein: 40, carbs: 50, fat: 10, completedAt: null, completedToday: false,
      },
    ],
    totalCalories: 2000, totalProtein: 120, totalCarbs: 200, totalFat: 60,
    generatedAt: new Date().toISOString(),
  };
  useFoodLogStore.setState({ selectedDate: todayString() });

  const { findByText, getByText } = render(<FoodLogScreen />);

  expect(await findByText('Fruta')).toBeTruthy();
  expect(getByText('600 / 2000 kcal')).toBeTruthy(); // barra
  expect(getByText('600')).toBeTruthy(); // "Calorias" do resumo
});
