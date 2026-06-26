import React from 'react';
import { render } from '@testing-library/react-native';
import { CalorieProgressBar } from './CalorieProgressBar';

describe('CalorieProgressBar', () => {
  it('mostra consumido / meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={500} goal={2000} />);
    expect(getByText('500 / 2000 kcal')).toBeTruthy();
  });

  it('mostra restante quando abaixo da meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={500} goal={2000} />);
    expect(getByText(/faltam 1500/)).toBeTruthy();
  });

  it('mostra meta atingida quando consumido >= meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={2100} goal={2000} />);
    expect(getByText(/meta atingida/i)).toBeTruthy();
  });
});
