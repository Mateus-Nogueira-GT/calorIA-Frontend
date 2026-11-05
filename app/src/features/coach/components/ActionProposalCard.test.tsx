import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ActionProposalCard } from './ActionProposalCard';
import type { ActionCard } from '../store';
import { todayString } from '@shared/utils/date';

const today = todayString();
const meal: ActionCard = {
  kind: 'log_meal',
  name: '2 ovos cozidos',
  weightGrams: 100,
  calories: 155,
  protein: 13,
  carbs: 1,
  fat: 11,
  fiber: 0,
  mealType: 'breakfast',
  date: today,
  status: 'idle',
};

it('refeição: nome, peso, valores, refeição e dia; botão Adicionar ao Diário', () => {
  const onApply = jest.fn();
  const s = render(<ActionProposalCard action={meal} onApply={onApply} onDismiss={jest.fn()} />);
  expect(s.getByText(/2 ovos cozidos · 100 g/)).toBeTruthy();
  expect(s.getByText(/155 kcal · P 13 g · C 1 g/)).toBeTruthy();
  expect(s.getByText(/Café da manhã · hoje/)).toBeTruthy();
  fireEvent.press(s.getByRole('button', { name: 'Adicionar ao Diário' }));
  expect(onApply).toHaveBeenCalled();
});

it('peso: mostra o que substitui e o aviso de diferença grande', () => {
  const s = render(
    <ActionProposalCard
      action={{
        kind: 'log_weight',
        weightKg: 86,
        date: today,
        replaces: 80.2,
        bigChange: true,
        status: 'idle',
      }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.getByText(/86 kg · hoje/)).toBeTruthy();
  expect(s.getByText(/Substitui o peso de hoje \(80,2 kg\)/)).toBeTruthy();
  expect(s.getByText(/Confira: bem diferente/)).toBeTruthy();
  expect(s.getByRole('button', { name: 'Registrar na Evolução' })).toBeTruthy();
});

it('refeição do plano: título e botão Marcar como feita; salvo mostra a confirmação', () => {
  const action: ActionCard = {
    kind: 'complete_plan_meal',
    mealId: 'pm1',
    title: 'Almoço',
    calories: 650,
    status: 'idle',
  };
  const s = render(
    <ActionProposalCard action={action} onApply={jest.fn()} onDismiss={jest.fn()} />,
  );
  expect(s.getByText('Almoço')).toBeTruthy();
  expect(s.getByRole('button', { name: 'Marcar como feita' })).toBeTruthy();
  s.rerender(
    <ActionProposalCard
      action={{ ...action, status: 'saved' }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.getByText('Refeição marcada')).toBeTruthy();
  expect(s.queryByRole('button')).toBeNull();
});

it('dispensado não renderiza', () => {
  const s = render(
    <ActionProposalCard
      action={{ ...meal, status: 'dismissed' }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.toJSON()).toBeNull();
});
