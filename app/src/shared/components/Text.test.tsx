import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from './Text';

describe('Text', () => {
  it('renderiza o conteúdo passado como children', () => {
    const { getByText } = render(<Text>Olá mundo</Text>);
    expect(getByText('Olá mundo')).toBeTruthy();
  });

  it('aplica fontSize xxxl na variante heading1', () => {
    const { getByText } = render(<Text variant="heading1">Título</Text>);
    const el = getByText('Título');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 36 })]),
    );
  });

  it('aplica fontSize sm na variante caption', () => {
    const { getByText } = render(<Text variant="caption">Legenda</Text>);
    const el = getByText('Legenda');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 13 })]),
    );
  });
});
