import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { formatCredits } from '@shared/services/credits.service';
import { colors, spacing } from '@theme';
import { useCreditsStore } from '../store';

export function CreditBalance({ onPress }: { onPress: () => void }): React.JSX.Element | null {
  const { wallet, error, load, featureVisible } = useCreditsStore();
  useEffect(() => {
    void load();
  }, [load]);
  // Existing releases stay unchanged while backend enforcement is disabled —
  // including when the wallet request fails (no "Saldo indisponível" for an
  // account that has never had credits enabled).
  if (!featureVisible) return null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text>
        {error
          ? 'Saldo indisponível · consultar'
          : `${formatCredits(wallet?.available_units ?? 0)} créditos disponíveis`}
      </Text>
      {wallet?.enforcement_enabled && (
        <Text variant="caption">Foto: 3 créditos · 5 mensagens: 1 crédito</Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.xs,
  },
});
