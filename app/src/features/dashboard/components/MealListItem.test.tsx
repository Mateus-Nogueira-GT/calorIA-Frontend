import React from 'react';
import { render } from '@testing-library/react-native';
import { MealListItem } from './MealListItem';

const base = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, fiber: null, loggedAt: '2026-10-27 12:00:00+00', mealType: 'lunch' as const };

describe('MealListItem', () => {
  it('refeição normal mostra calorias e macros', () => {
    const { getByText } = render(<MealListItem meal={base} />);
    expect(getByText('450 kcal')).toBeTruthy();
  });

  it('registro impossível não mostra os números', () => {
    const { queryByText, getByText } = render(
      <MealListItem meal={{ ...base, calories: 999999, protein: 999999, carbs: 999999, fat: 999999 }} />,
    );
    expect(queryByText(/999/)).toBeNull();
    expect(getByText('Valores impossíveis: corrija no Diário.')).toBeTruthy();
  });
});
