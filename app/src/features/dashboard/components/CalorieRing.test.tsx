import React from 'react';
import { render } from '@testing-library/react-native';
import { CalorieRing, halfDegrees } from './CalorieRing';

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

describe('CalorieRing — arco no nativo (L2)', () => {
  it('0%: nenhuma metade colorida', () => {
    const { queryByTestId } = render(<CalorieRing current={0} goal={2000} />);
    expect(queryByTestId('ring-half-right')).toBeNull();
    expect(queryByTestId('ring-half-left')).toBeNull();
  });

  it('30%: só a metade direita', () => {
    const { queryByTestId } = render(<CalorieRing current={600} goal={2000} />);
    expect(queryByTestId('ring-half-right')).toBeTruthy();
    expect(queryByTestId('ring-half-left')).toBeNull();
  });

  it('80%: as duas metades', () => {
    const { queryByTestId } = render(<CalorieRing current={1600} goal={2000} />);
    expect(queryByTestId('ring-half-right')).toBeTruthy();
    expect(queryByTestId('ring-half-left')).toBeTruthy();
  });

  it('100%: as duas metades (anel completo)', () => {
    const { queryByTestId } = render(<CalorieRing current={2000} goal={2000} />);
    expect(queryByTestId('ring-half-right')).toBeTruthy();
    expect(queryByTestId('ring-half-left')).toBeTruthy();
  });
});

describe('halfDegrees — ângulo dos semicírculos (L2)', () => {
  it('0% oculta as duas metades (-180°)', () => {
    expect(halfDegrees(0, 'right')).toBe(-180);
    expect(halfDegrees(0, 'left')).toBe(-180);
  });

  it('25% → direita a meio caminho; esquerda ainda oculta', () => {
    expect(halfDegrees(0.25, 'right')).toBe(-90);
    expect(halfDegrees(0.25, 'left')).toBe(-180);
  });

  it('50% → direita cheia (0°), esquerda oculta', () => {
    expect(halfDegrees(0.5, 'right')).toBe(0);
    expect(halfDegrees(0.5, 'left')).toBe(-180);
  });

  it('75% → direita cheia, esquerda a meio caminho', () => {
    expect(halfDegrees(0.75, 'right')).toBe(0);
    expect(halfDegrees(0.75, 'left')).toBe(-90);
  });

  it('100% → as duas cheias (anel completo)', () => {
    expect(halfDegrees(1, 'right')).toBe(0);
    expect(halfDegrees(1, 'left')).toBe(0);
  });
});
