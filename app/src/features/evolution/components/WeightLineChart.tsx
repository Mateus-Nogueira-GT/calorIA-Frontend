import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import type { WeightEntry } from '@shared/services/weight.service';

export function WeightLineChart({ entries }: { entries: WeightEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return <Text style={styles.empty}>Sem registros de peso ainda.</Text>;
  }
  const weights = entries.map((e) => e.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {entries.map((e) => {
          const h = 24 + ((e.weightKg - min) / range) * 80; // 24..104px
          return (
            <View key={e.id} style={styles.barCol}>
              <Text style={styles.value}>{e.weightKg}</Text>
              <View style={[styles.bar, { height: h }]} />
              <Text style={styles.day}>{e.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: 16, padding: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  barCol: { alignItems: 'center', flex: 1, gap: 4 },
  value: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted },
  bar: { width: 14, borderRadius: 999, backgroundColor: colors.brandPrimary },
  day: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted },
  empty: { textAlign: 'center', color: colors.brandTextMuted, fontSize: typography.fontSize.base, paddingVertical: 24 },
});
