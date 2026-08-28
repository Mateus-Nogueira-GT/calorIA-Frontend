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
  completedToday: false,
};

describe('MealPlanCard', () => {
  it('mostra "Marcar como concluída" quando não concluída no dia', () => {
    const { getByText } = render(
      <MealPlanCard meal={baseMeal} isToggling={false} onToggleComplete={() => {}} />,
    );
    expect(getByText('Marcar como concluída')).toBeTruthy();
  });

  it('mostra "✓ Concluída" quando concluída NO dia', () => {
    const { getByText } = render(
      <MealPlanCard
        meal={{ ...baseMeal, completedAt: '2026-06-11T08:00:00Z', completedToday: true }}
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

  // completedToday é o campo canônico: completedAt cru pode ser de semanas
  // atrás e não significa "feita hoje" (mesma razão do B1 no backend).
  it('não considera concluída quando completedAt é antigo mas não é de hoje', () => {
    const { getByText } = render(
      <MealPlanCard
        meal={{ ...baseMeal, completedAt: '2026-05-01T08:00:00Z', completedToday: false }}
        isToggling={false}
        onToggleComplete={() => {}}
      />,
    );
    expect(getByText('Marcar como concluída')).toBeTruthy();
  });
});