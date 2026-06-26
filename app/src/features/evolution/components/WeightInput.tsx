import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '@theme';
import { Button } from '@shared/components/Button';

interface Props {
  onSave: (kg: number) => void;
  saving: boolean;
}

export function WeightInput({ onSave, saving }: Props): React.JSX.Element {
  const [value, setValue] = useState('');

  const submit = () => {
    const kg = Number(value.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) return;
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
          onChangeText={setValue}
          keyboardType='numeric'
          placeholder='Ex: 80.5'
          placeholderTextColor={colors.brandTextMuted}
        />
      </View>
      <Button onPress={submit} loading={saving}>Registrar peso de hoje</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  label: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  row: { flexDirection: 'row' },
  input: { flex: 1, backgroundColor: colors.brandMutedSurface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: spacing.md, fontSize: typography.fontSize.md, color: colors.brandText },
});
