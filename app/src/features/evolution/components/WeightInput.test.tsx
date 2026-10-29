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

  it.each(['0,5', '12', '301', '800'])('peso impossível (%s) não salva e explica a faixa', (v) => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.changeText(getByTestId('weight-input'), v);
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText('Informe um peso entre 30 e 300 kg.')).toBeTruthy();
  });

  it('aceita vírgula e os extremos da faixa', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.changeText(getByTestId('weight-input'), '30');
    fireEvent.press(getByText('Registrar peso de hoje'));
    fireEvent.changeText(getByTestId('weight-input'), '299,9');
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).toHaveBeenNthCalledWith(1, 30);
    expect(onSave).toHaveBeenNthCalledWith(2, 299.9);
  });
});
