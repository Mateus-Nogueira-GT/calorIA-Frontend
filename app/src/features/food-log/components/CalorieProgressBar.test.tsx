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

describe('CalorieProgressBar — soma com decimais (245,7 + 312,4)', () => {
  it('não mostra 558.0999999999999 nem "faltam 1136.9000000000001"', () => {
    const { getByText, queryByText } = render(
      <CalorieProgressBar consumed={245.7 + 312.4} goal={1695.4} />,
    );
    expect(getByText('558 / 1695 kcal')).toBeTruthy();
    expect(getByText('faltam 1137 kcal')).toBeTruthy();
    expect(queryByText(/\d\.\d{3,}/)).toBeNull();
  });
});
