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

  describe('altura de linha acompanha a fonte (texto cortado no tablet)', () => {
    const flat = (el: { props: { style?: unknown } }) =>
      StyleSheet.flatten(el.props.style as never) as { lineHeight?: number };

    it('fonte maior que a linha herdada ganha lineHeight proporcional', () => {
      const { getByText } = render(<Text style={{ fontSize: 48 }}>1234</Text>);
      // body herda 24; 48 × 1,2 = 57,6 → 58
      expect(flat(getByText('1234')).lineHeight).toBe(58);
    });

    it('fonte que já cabe na linha herdada não muda o layout', () => {
      const { getByText } = render(<Text style={{ fontSize: 12 }}>pequeno</Text>);
      expect(flat(getByText('pequeno')).lineHeight).toBe(24);
    });

    it('lineHeight explícito sempre vence', () => {
      const { getByText } = render(
        <Text variant="heading1" style={{ fontSize: 38, lineHeight: 46 }}>
          logo
        </Text>,
      );
      expect(flat(getByText('logo')).lineHeight).toBe(46);
    });

    it('estilo em array também é considerado', () => {
      const { getByText } = render(<Text style={[{ fontSize: 30 }, { color: 'red' }]}>oi</Text>);
      expect(flat(getByText('oi')).lineHeight).toBe(36);
    });

    it('variante sem lineHeight (label) não recebe um', () => {
      const { getByText } = render(
        <Text variant="label" style={{ fontSize: 40 }}>
          rótulo
        </Text>,
      );
      expect(flat(getByText('rótulo')).lineHeight).toBeUndefined();
    });
  });
});
