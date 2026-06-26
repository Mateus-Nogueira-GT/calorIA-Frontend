import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('mostra título e subtítulo', () => {
    const { getByText } = render(<EmptyState title='Nada aqui' subtitle='Adicione algo' />);
    expect(getByText('Nada aqui')).toBeTruthy();
    expect(getByText('Adicione algo')).toBeTruthy();
  });
  it('renderiza CTA e dispara onAction', () => {
    const onAction = jest.fn();
    const { getByText } = render(<EmptyState title='Vazio' actionLabel='Criar' onAction={onAction} />);
    fireEvent.press(getByText('Criar'));
    expect(onAction).toHaveBeenCalled();
  });
  it('sem actionLabel não renderiza CTA', () => {
    const { queryByText } = render(<EmptyState title='Vazio' />);
    expect(queryByText('Criar')).toBeNull();
  });
});
