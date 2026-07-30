import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing } from '@theme';
import { useDietStore } from '@features/diet/store';
import { showAlert } from '@shared/utils/show-alert';

interface Props {
  onSuccess: () => void;
}

export function GenerateDietButton({ onSuccess }: Props): React.JSX.Element {
  const isLoading = useDietStore((s) => s.isLoading);
  const loadCurrent = useDietStore((s) => s.loadCurrent);

  const handlePress = async () => {
    try {
      // A dieta já foi gerada pelo /chat/message — aqui só garantimos que
      // a store está com os dados mais recentes antes de navegar.
      await loadCurrent();
      onSuccess();
    } catch {
      showAlert('Não foi possível abrir sua dieta', 'Tente novamente.');
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading }}
        disabled={isLoading}
        onPress={handlePress}
        style={[styles.btn, isLoading && styles.btnDisabled]}
      >
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.brandAnchor} />
            <Text style={styles.btnText}>  Abrindo sua dieta...</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>Ver minha dieta</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.lg, paddingLeft: 40, paddingRight: spacing.sm },
  btn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.base },
});
