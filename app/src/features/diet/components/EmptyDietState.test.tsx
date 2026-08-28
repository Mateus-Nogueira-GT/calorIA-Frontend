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
    const { getByText } = render(<EmptyDietState mode="error" onAction={() => {}} />);
    expect(getByText('Não foi possível carregar sua dieta')).toBeTruthy();
    expect(getByText('Tentar novamente')).toBeTruthy();
  });

  it('dispara onAction ao tocar no CTA', () => {
    const onAction = jest.fn();
    const { getByText } = render(<EmptyDietState onAction={onAction} />);
    fireEvent.press(getByText('Falar com o Coach'));
    expect(onAction).toHaveBeenCalled();
  });

  it('modo incompleto oferece retomar a geração (M8)', () => {
    // Quem tem plano ativo com o dia de hoje não gerado não pode ver
    // "você ainda não tem uma dieta" — é falso e leva ao onboarding errado.
    const { getByText } = render(<EmptyDietState mode="incomplete" onAction={() => {}} />);
    expect(getByText('Seu plano ainda está incompleto')).toBeTruthy();
    expect(getByText('Retomar geração')).toBeTruthy();
  });
});