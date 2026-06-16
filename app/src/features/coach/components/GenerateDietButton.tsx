import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';
import { useDietStore } from '@features/diet/store';

interface Props {
  onSuccess: () => void;
}

export function GenerateDietButton({ onSuccess }: Props): React.JSX.Element {
  const isGenerating = useDietStore((s) => s.isGenerating);
  const generate = useDietStore((s) => s.generate);

  const handlePress = async () => {
    try {
      await generate();
      onSuccess();
    } catch {
      Alert.alert('Não foi possível gerar sua dieta', 'Tente novamente.');
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isGenerating }}
        disabled={isGenerating}
        onPress={handlePress}
        style={[styles.btn, isGenerating && styles.btnDisabled]}
      >
        {isGenerating ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.btnText}>  Gerando sua dieta...</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>✨ Gerar minha dieta agora</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 16, paddingHorizontal: 8 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
