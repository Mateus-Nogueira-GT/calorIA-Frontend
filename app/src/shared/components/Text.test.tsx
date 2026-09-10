import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Text } from './Text';
import { typography } from '@theme';

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

  /**
   * X1a: `variant="heading3"` era usado por ProfileGoalsScreen e
   * ProfileCoachPersonalityScreen sem existir no componente. Em runtime
   * `styles['heading3']` era undefined e NENHUM estilo de variante era
   * aplicado — o título perdia a fonte da marca e caía na do sistema.
   */
  it('aplica a fonte da marca em todas as variantes de heading', () => {
    const { getByText } = render(
      <>
        <Text variant="heading1">h1</Text>
        <Text variant="heading2">h2</Text>
        <Text variant="heading3">h3</Text>
      </>,
    );

    for (const label of ['h1', 'h2', 'h3']) {
      const style = StyleSheet.flatten(getByText(label).props.style);
      expect(style.fontFamily).toBe(typography.fontFamily.bold);
      expect(typeof style.fontSize).toBe('number');
    }
  });

  it('heading3 fica entre heading2 e body no tamanho', () => {
    const { getByText } = render(
      <>
        <Text variant="heading2">h2</Text>
        <Text variant="heading3">h3</Text>
        <Text variant="body">b</Text>
      </>,
    );
    const size = (label: string) => StyleSheet.flatten(getByText(label).props.style).fontSize;
    expect(size('h2')).toBeGreaterThan(size('h3'));
    expect(size('h3')).toBeGreaterThan(size('b'));
  });

  it('aplica fontSize sm na variante caption', () => {
    const { getByText } = render(<Text variant="caption">Legenda</Text>);
    const el = getByText('Legenda');
    expect(el.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 13 })]),
    );
  });
});
