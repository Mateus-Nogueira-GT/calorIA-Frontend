import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightInput } from './WeightInput';

describe('WeightInput', () => {
  it('salva um número válido', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.changeText(getByTestId('weight-input'), '80.5');
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).toHaveBeenCalledWith(80.5);
  });

  it('não salva valor inválido', () => {
    const onSave = jest.fn();
    const { getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
