import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  completedCount: number;
  totalCount: number;
}

export function DietProgressHeader({ completedCount, totalCount }: Props): React.JSX.Element {
  const pct = totalCount > 0 ? completedCount / totalCount : 0;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sua dieta de hoje</Text>
      <Text style={styles.subtitle}>
        {completedCount} de {totalCount} refeições concluídas
      </Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  title: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
});
