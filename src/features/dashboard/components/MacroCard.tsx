import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { label: string; current: number; goal: number; unit?: string; color: string }

export function MacroCard({ label, current, goal, unit = 'g', color }: Props): React.JSX.Element {
  const pct = goal > 0 ? Math.min(Math.max(current / goal, 0), 1) : 0;
  const pctLabel = goal > 0 ? `${Math.round((current / goal) * 100)}%` : '--';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.percent, { color }]}>{pctLabel}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{current}{unit}</Text>
      <Text style={styles.goal}>Meta {goal}{unit}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as const, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 0,
    flex: 1,
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 14,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { flex: 1, fontSize: typography.fontSize.xs, color: colors.brandTextMuted, fontFamily: typography.fontFamily.semiBold },
  percent: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold },
  value: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.extraBold, marginTop: 10 },
  goal: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted, marginTop: 2, marginBottom: 12 },
  track: { height: 6, backgroundColor: colors.brandTrack, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999 },
});
