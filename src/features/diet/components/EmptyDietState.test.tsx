import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyDietState } from './EmptyDietState';

describe('EmptyDietState', () => {
  it('modo padrão mostra CTA para Coach', () => {
    const { getByText } = render(<EmptyDietState onAction={() => {}} />);
    expect(getByText('Você ainda não tem uma dieta')).toBeTruthy();
    expect(getByText('Falar com o Coach')).toBeTruthy();
  });

  it('modo erro mostra CTA de retry', () => {
    const { getByText } = render(<EmptyDietState errorMode onAction={() => {}} />);
    expect(getByText('Não foi possível carregar sua dieta')).toBeTruthy();
    expect(getByText('Tentar novamente')).toBeTruthy();
  });

  it('dispara onAction ao tocar no CTA', () => {
    const onAction = jest.fn();
    const { getByText } = render(<EmptyDietState onAction={onAction} />);
    fireEvent.press(getByText('Falar com o Coach'));
    expect(onAction).toHaveBeenCalled();
  });
});
