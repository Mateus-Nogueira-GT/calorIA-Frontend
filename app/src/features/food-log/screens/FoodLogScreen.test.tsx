import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';
import { FoodLogScreen } from './FoodLogScreen';
import { useFoodLogStore } from '../store';

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

jest.mock('@features/diet/store', () => ({
  useDietStore: (selector: (s: { plan: null }) => unknown) => selector({ plan: null }),
}));

beforeEach(() =>
  useFoodLogStore.setState({
    mealsByDate: {},
    syncedDates: {},
    loadingByDate: {},
    selectedDate: '2026-06-09',
  }),
);

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
