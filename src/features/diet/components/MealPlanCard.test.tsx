import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MealPlanCard } from './MealPlanCard';
import type { PlannedMeal } from '@shared/services/diet.service';

const baseMeal: PlannedMeal = {
  id: 'm1',
  type: 'breakfast',
  title: 'Café',
  suggestedTime: '08:00',
  items: [{ name: 'Banana', quantity: 1, unit: 'un', calories: 100 }],
  calories: 400,
  protein: 20,
  carbs: 50,
  fat: 10,
  completedAt: null,
};

describe('MealPlanCard', () => {
  it('mostra "Marcar como concluída" quando completedAt é null', () => {
    const { getByText } = render(
      <MealPlanCard meal={baseMeal} isToggling={false} onToggleComplete={() => {}} />,
    );
    expect(getByText('Marcar como concluída')).toBeTruthy();
  });

  it('mostra "✓ Concluída" quando completedAt é setado', () => {
    const { getByText } = render(
      <MealPlanCard
        meal={{ ...baseMeal, completedAt: '2026-06-11T08:00:00Z' }}
        isToggling={false}
        onToggleComplete={() => {}}
      />,
    );
    expect(getByText('✓ Concluída')).toBeTruthy();
  });

  it('dispara onToggleComplete ao tocar no botão', () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <MealPlanCard meal={baseMeal} isToggling={false} onToggleComplete={onToggle} />,
    );
    fireEvent.press(getByText('Marcar como concluída'));
    expect(onToggle).toHaveBeenCalledWith('m1');
  });
});
