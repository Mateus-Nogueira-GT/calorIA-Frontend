import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';

interface Props {
  consumed: number;
  goal: number;
}

export function CalorieProgressBar({ consumed, goal }: Props): React.JSX.Element {
  const ratio = goal > 0 ? consumed / goal : 0;
  const pct = Math.min(Math.max(ratio, 0), 1);
  const reached = consumed >= goal && goal > 0;
  const remaining = Math.max(goal - consumed, 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.value}>{consumed} / {goal} kcal</Text>
        <Text style={[styles.status, reached && styles.statusReached]}>
          {reached ? '🎉 meta atingida' : `faltam ${remaining} kcal`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: reached ? colors.brandSupport : colors.brandPrimary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  status: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  statusReached: { color: colors.brandAnchor },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.brandTrack, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
});
