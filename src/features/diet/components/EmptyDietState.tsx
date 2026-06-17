import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  errorMode?: boolean;
  onAction: () => void;
}

const errorTitle = 'Nao foi possivel carregar sua dieta';
const emptyTitle = 'Sua dieta do dia ainda nao apareceu';
const errorSubtitle = 'Tente novamente em instantes.';
const emptySubtitle = 'Converse com o Coach para gerar um plano personalizado.';
const retryLabel = 'Tentar novamente';
const coachLabel = 'Falar com o Coach';

export function EmptyDietState({ errorMode, onAction }: Props): React.JSX.Element {
  const title = errorMode ? errorTitle : emptyTitle;
  const subtitle = errorMode ? errorSubtitle : emptySubtitle;
  const cta = errorMode ? retryLabel : coachLabel;

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
    padding: 20,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  marker: {
    width: 40,
    height: 6,
    borderRadius: 999,
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
