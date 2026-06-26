import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';

interface Props {
  errorMode?: boolean;
  onAction: () => void;
}

export function EmptyDietState({ errorMode, onAction }: Props): React.JSX.Element {
  const title = errorMode ? 'Não foi possível carregar sua dieta' : 'Você ainda não tem uma dieta';
  const subtitle = errorMode
    ? 'Tente novamente em instantes.'
    : 'Converse com o Coach para gerar um plano personalizado.';
  const cta = errorMode ? 'Tentar novamente' : 'Falar com o Coach';

  return (
    <View style={styles.card}>
      <View style={styles.marker} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Button onPress={onAction} style={styles.btn} labelStyle={styles.btnText}>{cta}</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.xl,
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  marker: {
    width: 40,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSupport,
    marginBottom: 14,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    marginTop: 6,
    marginBottom: 14,
  },
  btn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  btnText: { color: colors.brandAnchor },
});
