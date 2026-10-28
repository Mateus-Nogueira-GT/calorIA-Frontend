import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FoodLogItem } from './FoodLogItem';

const meal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString(), mealType: 'other' as const };

describe('FoodLogItem', () => {
  it('renderiza nome e calorias', () => {
    const { getByText } = render(<FoodLogItem meal={meal} onDelete={() => {}} />);
    expect(getByText('Frango')).toBeTruthy();
    expect(getByText('450 kcal')).toBeTruthy();
  });

  it('chama onDelete com o id correto', () => {
    const onDelete = jest.fn();
    const { getByTestId } = render(<FoodLogItem meal={meal} onDelete={onDelete} />);
    fireEvent.press(getByTestId('delete-m1'));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  it('mostra fibra quando houver e chama onEdit com a refeição', () => {
    const onEdit = jest.fn();
    const { getByText, getByTestId } = render(
      <FoodLogItem meal={{ ...meal, fiber: 4 }} onDelete={() => {}} onEdit={onEdit} />,
    );
    expect(getByText('Proteínas 38g · Carboidratos 52g · Gorduras 8g · Fibras 4g')).toBeTruthy();
    fireEvent.press(getByTestId('edit-m1'));
    expect(onEdit).toHaveBeenCalledWith({ ...meal, fiber: 4 });
  });

  it('sem fibra, a linha omite as fibras', () => {
    const { getByText } = render(<FoodLogItem meal={{ ...meal, fiber: null }} onDelete={() => {}} />);
    expect(getByText('Proteínas 38g · Carboidratos 52g · Gorduras 8g')).toBeTruthy();
  });
});

describe('FoodLogItem — registro impossível', () => {
  const absurd = { ...meal, id: 'm9', name: 'teste', calories: 999999, protein: 999999, carbs: 999999, fat: 999999, fiber: 999999 };

  it('não mostra os números e pede correção, mantendo editar e apagar', () => {
    const onEdit = jest.fn();
    const { queryByText, getByText, getByTestId } = render(
      <FoodLogItem meal={absurd} onDelete={() => {}} onEdit={onEdit} />,
    );
    expect(queryByText(/999/)).toBeNull();
    expect(getByText('Valores impossíveis: não contam no dia. Corrija ou apague.')).toBeTruthy();
    fireEvent.press(getByTestId('edit-m9'));
    expect(onEdit).toHaveBeenCalled();
    expect(getByTestId('delete-m9')).toBeTruthy();
  });
});
