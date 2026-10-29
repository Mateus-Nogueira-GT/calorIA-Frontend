import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { isPlausibleWeightKg, WEIGHT_RANGE_MESSAGE } from '@shared/utils/body-limits';

interface Props {
  onSave: (kg: number) => void;
  saving: boolean;
}

export function WeightInput({ onSave, saving }: Props): React.JSX.Element {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (value.trim() === '') return;
    const kg = Number(value.replace(',', '.'));
    // Antes aceitava 0,5 kg (ia para o gráfico) e acima de 500 kg dava só
    // "Tente novamente" do servidor. Mesma faixa do cadastro inicial.
    if (!isPlausibleWeightKg(kg)) {
      setError(WEIGHT_RANGE_MESSAGE);
      return;
    }
    setError(null);
    onSave(kg);
    setValue('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Peso de hoje (kg)</Text>
      <View style={styles.row}>
        <TextInput
          testID='weight-input'
          style={styles.input}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          keyboardType='numeric'
          placeholder='Ex: 80.5'
          placeholderTextColor={colors.brandTextMuted}
        />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button onPress={submit} loading={saving}>Registrar peso de hoje</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  label: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  row: { flexDirection: 'row' },
  input: { flex: 1, backgroundColor: colors.brandMutedSurface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: spacing.md, fontSize: typography.fontSize.md, color: colors.brandText },
  error: { color: colors.error, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
});
