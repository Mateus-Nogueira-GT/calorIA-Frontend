import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AddMealModal } from './AddMealModal';

describe('AddMealModal', () => {
  it('exibe feedback quando salvar refeicao falha', async () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn().mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByTestId, getByText } = render(
      <AddMealModal visible onClose={onClose} onSubmit={onSubmit} />,
    );

    fireEvent.changeText(getByTestId('meal-name-input'), 'Iogurte');
    fireEvent.changeText(getByTestId('meal-calories-input'), '120');
    fireEvent.press(getByText('Salvar refeição'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Nao foi possivel salvar a refeicao',
        'Tente novamente em instantes.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
