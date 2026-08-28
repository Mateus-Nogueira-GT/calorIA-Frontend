import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';

/**
 * `incomplete` (M8): o usuário TEM plano ativo, mas a geração parou antes de
 * chegar no dia de hoje. Mostrar o vazio de onboarding aqui era enganoso —
 * sugeria que ele não tinha dieta nenhuma.
 */
type Mode = 'empty' | 'error' | 'incomplete';

interface Props {
  mode?: Mode;
  onAction: () => void;
}

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  empty: {
    title: 'Você ainda não tem uma dieta',
    subtitle: 'Converse com o Coach para gerar um plano personalizado.',
    cta: 'Falar com o Coach',
  },
  error: {
    title: 'Não foi possível carregar sua dieta',
    subtitle: 'Tente novamente em instantes.',
    cta: 'Tentar novamente',
  },
  incomplete: {
    title: 'Seu plano ainda está incompleto',
    subtitle: 'A geração parou antes de chegar no dia de hoje. Dá para retomar de onde parou.',
    cta: 'Retomar geração',
  },
};

export function EmptyDietState({ mode = 'empty', onAction }: Props): React.JSX.Element {
  const { title, subtitle, cta } = COPY[mode];

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
