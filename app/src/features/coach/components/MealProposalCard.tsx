import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import type { ProposalCard } from '../store';

interface Props {
  proposal: ProposalCard;
  onApply: () => void;
  onDismiss: () => void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * 05/11 (M3): a correção do coach só é gravada quando o usuário toca aqui —
 * antes dependia de o modelo esperar o "sim".
 */
export function MealProposalCard({
  proposal,
  onApply,
  onDismiss,
}: Props): React.JSX.Element | null {
  if (proposal.status === 'dismissed') return null;
  const saving = proposal.status === 'saving';
  const weight = proposal.weightGrams != null ? ` · ${fmt(proposal.weightGrams)} g` : '';

  return (
    <View style={styles.card} accessibilityLabel="Correção proposta pelo coach">
      <Text style={styles.from} numberOfLines={1}>
        {proposal.currentName}
      </Text>
      <Text style={styles.to}>
        → {proposal.name}
        {weight}
      </Text>
      <Text style={styles.values}>
        {Math.round(proposal.calories)} kcal · P {fmt(proposal.protein)} g · C {fmt(proposal.carbs)}{' '}
        g · G {fmt(proposal.fat)} g
      </Text>

      {proposal.status === 'saved' ? (
        <Text style={styles.saved}>Registro atualizado</Text>
      ) : (
        <>
          {proposal.status === 'error' && (
            <Text style={styles.error}>Não consegui salvar. Tente de novo.</Text>
          )}
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
                <Text style={styles.applyText}>Atualizar registro</Text>
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
  from: {
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    textDecorationLine: 'line-through',
  },
  to: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
  },
  values: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.regular,
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
