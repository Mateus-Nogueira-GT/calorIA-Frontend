import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Button } from './Button';

interface Props {
  title?: string;
  subtitle?: string;
  onRetry: () => void;
}

export function ErrorState({
  title = 'Algo deu errado',
  subtitle = 'Verifique sua conexão e tente novamente.',
  onRetry,
}: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😕</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Button onPress={onRetry}>Tentar de novo</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xxxl,
    gap: spacing.sm,
  },
  emoji: { fontSize: typography.fontSize.xxl },
  title: {
    fontSize: typography.fontSize.md,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
