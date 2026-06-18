import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FoodLogItem } from './FoodLogItem';

const meal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };

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
});
