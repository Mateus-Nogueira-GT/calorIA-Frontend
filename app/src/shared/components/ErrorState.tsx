import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
import { Button } from './Button';

interface Props {
  title?: string;
  subtitle?: string;
  onRetry: () => void;
}

const retryLabel = 'Tentar de novo';

export function ErrorState({
  title = 'Algo deu errado',
  subtitle = 'Verifique sua conexão e tente novamente.',
  onRetry,
}: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.marker} accessible={false} aria-hidden><Text style={styles.markerText}>!</Text></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Button onPress={onRetry}>{retryLabel}</Button>
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
  marker: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandDividerStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandMutedSurface },
  markerText: { fontSize: typography.fontSize.lg, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
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
