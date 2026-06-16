import React from 'react';
import { render } from '@testing-library/react-native';
import { DietProgressHeader } from './DietProgressHeader';

describe('DietProgressHeader', () => {
  it('mostra contagem correta', () => {
    const { getByText } = render(<DietProgressHeader completedCount={2} totalCount={4} />);
    expect(getByText('2 de 4 refeições concluídas')).toBeTruthy();
  });

  it('lida com totalCount zero sem dividir por zero', () => {
    const { getByText } = render(<DietProgressHeader completedCount={0} totalCount={0} />);
    expect(getByText('0 de 0 refeições concluídas')).toBeTruthy();
  });
});
