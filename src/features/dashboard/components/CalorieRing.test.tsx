import React from 'react';
import { render } from '@testing-library/react-native';
import { CalorieRing } from './CalorieRing';

describe('CalorieRing', () => {
  it('renderiza 0 por cento', () => {
    const { getByText } = render(<CalorieRing current={0} goal={2000} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('renderiza 50 por cento', () => {
    const { getByText } = render(<CalorieRing current={1000} goal={2000} />);
    expect(getByText('50%')).toBeTruthy();
  });

  it('renderiza 100 por cento', () => {
    const { getByText } = render(<CalorieRing current={2000} goal={2000} />);
    expect(getByText('100%')).toBeTruthy();
  });

  it('renderiza acima de 100 por cento sem quebrar', () => {
    const { getByText } = render(<CalorieRing current={2400} goal={2000} />);
    expect(getByText('120%')).toBeTruthy();
  });
});
