import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('usa título padrão e dispara onRetry', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorState onRetry={onRetry} />);
    expect(getByText('Algo deu errado')).toBeTruthy();
    fireEvent.press(getByText('Tentar de novo'));
    expect(onRetry).toHaveBeenCalled();
  });
  it('aceita título customizado', () => {
    const { getByText } = render(<ErrorState title='Falha ao carregar' onRetry={() => {}} />);
    expect(getByText('Falha ao carregar')).toBeTruthy();
  });
});
