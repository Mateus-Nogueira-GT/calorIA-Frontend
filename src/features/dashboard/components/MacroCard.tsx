import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { label: string; current: number; goal: number; unit?: string; color: string }

export function MacroCard({ label, current, goal, unit = 'g', color }: Props): React.JSX.Element {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{current}{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10 },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginBottom: 6, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  label: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  value: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, marginTop: 2 },
});
