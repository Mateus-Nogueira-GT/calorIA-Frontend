import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from '@shared/components';
import { colors, typography } from '@theme';
import { ScanResult } from '@shared/services/scanner.service';
import { ConfidenceBadge } from './ConfidenceBadge';

interface Props { result: ScanResult; onAdd: () => void; onReset: () => void }

export function ScanResultCard({ result, onAdd, onReset }: Props): React.JSX.Element {
  return (
    <View style={styles.card} testID="scan-result-card">
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{result.name}</Text>
          <ConfidenceBadge confidence={result.confidence} />
        </View>
        <Text style={styles.calories}>{result.calories}<Text style={styles.unit}> kcal</Text></Text>
      </View>
      <View style={styles.macros}>
        {[
          { label: 'Proteína', value: `${result.protein}g`, color: '#FF8C42' },
          { label: 'Carboidratos', value: `${result.carbs}g`, color: '#17A2B8' },
          { label: 'Gordura', value: `${result.fat}g`, color: '#FFC107' },
        ].map((m) => (
          <View key={m.label} style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: m.color }]}>{m.value}</Text>
            <Text style={styles.macroLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onReset} style={styles.resetBtn}>Escanear outro</Button>
        <Button onPress={onAdd} style={styles.addBtn}>+ Adicionar ao diário</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  name: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.bold, color: colors.textPrimary, marginBottom: 6 },
  calories: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.primary },
  unit: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontFamily: typography.fontFamily.regular },
  macros: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 16 },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold },
  macroLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  resetBtn: { flex: 1 },
  addBtn: { flex: 2 },
});
