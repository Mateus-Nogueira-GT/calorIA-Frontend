import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GenerateDietButton } from './GenerateDietButton';
import { useDietStore } from '@features/diet/store';

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('GenerateDietButton', () => {
  beforeEach(() => {
    useDietStore.setState({
      plan: undefined,
      isLoading: false,
      togglingMealId: null,
    });
  });

  it('renderiza estado idle', () => {
    const { getByText } = render(<GenerateDietButton onSuccess={() => {}} />);
    expect(getByText('Ver minha dieta')).toBeTruthy();
  });

  it('chama onSuccess quando loadCurrent resolve', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      loadCurrent: jest.fn().mockResolvedValue(undefined),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('Ver minha dieta'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('dispara Alert quando loadCurrent falha', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      loadCurrent: jest.fn().mockRejectedValue(new Error('boom')),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('Ver minha dieta'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
