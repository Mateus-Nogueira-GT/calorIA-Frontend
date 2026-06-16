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
      isGenerating: false,
      isLoading: false,
      togglingMealId: null,
    });
  });

  it('renderiza estado idle', () => {
    const { getByText } = render(<GenerateDietButton onSuccess={() => {}} />);
    expect(getByText('✨ Gerar minha dieta agora')).toBeTruthy();
  });

  it('chama onSuccess quando generate resolve', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      generate: jest.fn().mockResolvedValue({ id: 'p1' }),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('✨ Gerar minha dieta agora'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('dispara Alert quando generate falha', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      generate: jest.fn().mockRejectedValue(new Error('boom')),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('✨ Gerar minha dieta agora'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
