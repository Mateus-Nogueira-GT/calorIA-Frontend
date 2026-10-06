import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';

interface Props { label: string; current: number; goal: number | null; unit?: string; color: string }

export function MacroCard({ label, current, goal, unit = 'g', color }: Props): React.JSX.Element {
  // goal === null: ainda não há dieta gerada. Mostrar "Meta 0g" seria só
  // trocar uma mentira por outra — o card diz que a meta não existe ainda.
  const hasGoal = goal !== null && goal > 0;
  const pct = hasGoal ? Math.min(Math.max(current / goal, 0), 1) : 0;
  const pctLabel = hasGoal ? `${Math.round((current / goal) * 100)}%` : '--';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {hasGoal ? <Text numberOfLines={1} style={[styles.percent, { color }]}>{pctLabel}</Text> : null}
      </View>
      <Text style={[styles.value, { color }]}>{current}{unit}</Text>
      <Text style={styles.goal}>{hasGoal ? `Meta ${goal}${unit}` : 'Sem meta'}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as const, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 94,
    flex: 1,
    flexBasis: 94,
    backgroundColor: colors.brandSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.md,
  },
  header: { flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  label: { flex: 1, fontSize: typography.fontSize.xs, color: colors.brandTextMuted, fontFamily: typography.fontFamily.semiBold },
  percent: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold },
  value: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.extraBold, marginTop: 10 },
  goal: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted, marginTop: 2, marginBottom: spacing.md },
  track: { height: 6, backgroundColor: colors.brandTrack, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
});
