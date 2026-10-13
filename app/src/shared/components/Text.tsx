import React from 'react';
import { Text as RNText, StyleSheet, TextProps } from 'react-native';
import { colors, typography } from '@theme';

type Variant = 'heading1' | 'heading2' | 'heading3' | 'body' | 'caption' | 'label';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...rest }: Props): React.JSX.Element {
  // label não define lineHeight; as demais variantes sim.
  const base = styles[variant] as { lineHeight?: number } & TextProps['style'];
  return (
    <RNText
      style={[base, color ? { color } : undefined, style, autoLineHeight(base.lineHeight, style)]}
      {...rest}
    />
  );
}

/**
 * Texto cortado no tablet: a variante body impõe lineHeight 24, e um `style`
 * com fontSize 48 (total de calorias do Dashboard) renderizava o glifo numa
 * linha de 24 px — corte em cima e embaixo. Só age quando a fonte não cabe na
 * linha herdada; quem já cabe não muda de layout e lineHeight explícito vence.
 */
function autoLineHeight(
  inherited: number | undefined,
  style: TextProps['style'],
): { lineHeight: number } | undefined {
  const flat = StyleSheet.flatten(style);
  const fontSize = flat?.fontSize;
  if (inherited == null || fontSize == null || flat?.lineHeight != null) return undefined;
  const needed = fontSize * typography.lineHeight.tight;
  return needed > inherited ? { lineHeight: Math.ceil(needed) } : undefined;
}

// O acesso é dinâmico (`styles[variant]`), coisa que a regra no-unused-styles
// não consegue enxergar: ela acusa TODAS as variantes como não usadas.
// eslint-disable-next-line react-native/no-unused-styles
const styles = StyleSheet.create({
  heading1: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxxl,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.xxxl * typography.lineHeight.tight,
  },
  heading2: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.xl * typography.lineHeight.tight,
  },
  // Degrau entre heading2 (xl) e body (base). ProfileGoalsScreen e
  // ProfileCoachPersonalityScreen já pediam `heading3`; sem ele no StyleSheet,
  // `styles[variant]` era undefined e o título saía na fonte do sistema.
  heading3: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.lg * typography.lineHeight.tight,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
  },
  caption: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
