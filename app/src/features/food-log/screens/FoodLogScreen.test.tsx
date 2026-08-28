import React from 'react';
import { render, act } from '@testing-library/react-native';
import { FoodLogScreen } from './FoodLogScreen';
import { useFoodLogStore } from '../store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
    addMeal: jest.fn().mockResolvedValue({ id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString() }),
    deleteMeal: jest.fn().mockResolvedValue({ deleted: true }),
  },
}));

jest.mock('@features/diet/store', () => ({
  useDietStore: (selector: (s: { plan: null }) => unknown) => selector({ plan: null }),
}));

beforeEach(() => useFoodLogStore.setState({ mealsByDate: {}, syncedDates: {}, loadingByDate: {}, selectedDate: '2026-06-09' }));

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
});
