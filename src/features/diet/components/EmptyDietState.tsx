import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  errorMode?: boolean;
  onAction: () => void;
}

export function EmptyDietState({ errorMode, onAction }: Props): React.JSX.Element {
  const title = errorMode ? 'Não foi possível carregar sua dieta' : 'Você ainda não tem uma dieta';
  const subtitle = errorMode
    ? 'Toque pra tentar novamente.'
    : 'Fale com o Coach pra gerar uma dieta personalizada.';
  const cta = errorMode ? 'Tentar novamente' : 'Falar com o Coach';
  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{errorMode ? '⚠️' : '🥗'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <TouchableOpacity onPress={onAction} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: { fontSize: 36, marginBottom: 8 },
  title: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
