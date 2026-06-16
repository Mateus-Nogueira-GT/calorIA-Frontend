import React from 'react';
import { Text as RNText, StyleSheet, TextProps } from 'react-native';
import { colors, typography } from '@theme';

type Variant = 'heading1' | 'heading2' | 'body' | 'caption' | 'label';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...rest }: Props): React.JSX.Element {
  return (
    <RNText
      style={[styles[variant], color ? { color } : undefined, style]}
      {...rest}
    />
  );
}

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
