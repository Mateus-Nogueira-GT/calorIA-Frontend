import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { MealProposalCard } from './MealProposalCard';
import type { ProposalCard } from '../store';

const base: ProposalCard = {
  id: 'm1',
  date: '2026-11-04',
  currentName: 'Carne suína grelhada',
  name: 'Salmão grelhado',
  weightGrams: 180,
  mealType: 'dinner',
  calories: 376,
  protein: 40,
  carbs: 0,
  fat: 24.5,
  fiber: 0,
  status: 'idle',
};

it('mostra o registro atual, o novo, o peso e os valores', () => {
  const s = render(<MealProposalCard proposal={base} onApply={jest.fn()} onDismiss={jest.fn()} />);
  expect(s.getByText('Carne suína grelhada')).toBeTruthy();
  expect(s.getByText(/Salmão grelhado · 180 g/)).toBeTruthy();
  expect(s.getByText(/376 kcal · P 40 g · C 0 g · G 24,5 g/)).toBeTruthy();
});

it('Atualizar registro e Agora não chamam as ações', () => {
  const onApply = jest.fn();
  const onDismiss = jest.fn();
  const s = render(<MealProposalCard proposal={base} onApply={onApply} onDismiss={onDismiss} />);
  fireEvent.press(s.getByRole('button', { name: 'Atualizar registro' }));
  fireEvent.press(s.getByRole('button', { name: 'Agora não' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('salvo: some os botões e aparece "Registro atualizado"', () => {
  const s = render(
    <MealProposalCard
      proposal={{ ...base, status: 'saved' }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.getByText('Registro atualizado')).toBeTruthy();
  expect(s.queryByRole('button')).toBeNull();
});

it('erro: mensagem e o botão de novo; dispensado: nada', () => {
  const s = render(
    <MealProposalCard
      proposal={{ ...base, status: 'error' }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.getByText('Não consegui salvar. Tente de novo.')).toBeTruthy();
  expect(s.getByRole('button', { name: 'Atualizar registro' })).toBeTruthy();
  s.rerender(
    <MealProposalCard
      proposal={{ ...base, status: 'dismissed' }}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(s.toJSON()).toBeNull();
});
