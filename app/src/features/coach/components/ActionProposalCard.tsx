import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { todayString } from '@shared/utils/date';
import type { ActionCard } from '../store';

interface Props {
  action: ActionCard;
  onApply: () => void;
  onDismiss: () => void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

const MEAL_LABELS = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  snack: 'Lanche',
  dinner: 'Jantar',
} as const;

const APPLY_LABEL: Record<ActionCard['kind'], string> = {
  log_meal: 'Adicionar ao Diário',
  log_weight: 'Registrar na Evolução',
  complete_plan_meal: 'Marcar como feita',
};

const SAVED_LABEL: Record<ActionCard['kind'], string> = {
  log_meal: 'Adicionado ao Diário',
  log_weight: 'Peso registrado',
  complete_plan_meal: 'Refeição marcada',
};

const dayLabel = (date: string) => (date === todayString() ? 'hoje' : 'ontem');

function Body({ action }: { action: ActionCard }): React.JSX.Element {
  if (action.kind === 'log_meal') {
    return (
      <>
        <Text style={styles.title}>
          {action.name} · {fmt(action.weightGrams)} g
        </Text>
        <Text style={styles.values}>
          {Math.round(action.calories)} kcal · P {fmt(action.protein)} g · C {fmt(action.carbs)} g ·
          G {fmt(action.fat)} g
        </Text>
        <Text style={styles.meta}>
          {MEAL_LABELS[action.mealType]} · {dayLabel(action.date)}
        </Text>
      </>
    );
  }
  if (action.kind === 'log_weight') {
    return (
      <>
        <Text style={styles.title}>
          {fmt(action.weightKg)} kg · {dayLabel(action.date)}
        </Text>
        {action.replaces != null ? (
          <Text style={styles.meta}>
            Substitui o peso de {dayLabel(action.date)} ({fmt(action.replaces)} kg)
          </Text>
        ) : null}
        {action.bigChange ? (
          <Text style={styles.warning}>Confira: bem diferente do último registro</Text>
        ) : null}
      </>
    );
  }
  return (
    <>
      <Text style={styles.title}>{action.title}</Text>
      <Text style={styles.meta}>{Math.round(action.calories)} kcal · plano de hoje</Text>
    </>
  );
}

/**
 * 05/11 (ações com cartão): o coach propõe e só grava quando o usuário toca
 * aqui — mesmo padrão do cartão "Atualizar registro".
 */
export function ActionProposalCard({
  action,
  onApply,
  onDismiss,
}: Props): React.JSX.Element | null {
  if (action.status === 'dismissed') return null;
  const saving = action.status === 'saving';
  return (
    <View style={styles.card} accessibilityLabel="Ação proposta pelo coach">
      <Body action={action} />
      {action.status === 'saved' ? (
        <Text style={styles.saved}>{SAVED_LABEL[action.kind]}</Text>
      ) : (
        <>
          {action.status === 'error' ? (
            <Text style={styles.error}>Não consegui salvar. Tente de novo.</Text>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={onApply}
              style={[styles.apply, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.brandAnchor} />
              ) : (
                <Text style={styles.applyText}>{APPLY_LABEL[action.kind]}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={saving}
              onPress={onDismiss}
              style={styles.dismiss}
            >
              <Text style={styles.dismissText}>Agora não</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginLeft: 40,
    marginRight: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
    gap: 4,
  },
  title: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
  },
  values: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  meta: {
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  warning: {
    color: colors.warning,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  apply: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.sm,
  },
  disabled: { opacity: 0.7 },
  applyText: {
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
  },
  dismiss: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  dismissText: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },
  saved: {
    marginTop: spacing.sm,
    color: colors.brandPrimaryText,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.error,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
});
