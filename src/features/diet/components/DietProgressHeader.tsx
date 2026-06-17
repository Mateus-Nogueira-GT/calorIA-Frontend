import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  completedCount: number;
  totalCount: number;
}

export function DietProgressHeader({ completedCount, totalCount }: Props): React.JSX.Element {
  const pct = totalCount > 0 ? Math.min(completedCount / totalCount, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Text style={styles.title}>Plano do dia</Text>
        <Text style={styles.subtitle}>{completedCount} de {totalCount} refeicoes concluidas</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{Math.round(pct * 100)}%</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 18,
    marginBottom: 12,
  },
  copy: { paddingRight: 64 },
  title: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  badge: {
    position: 'absolute',
    top: 18,
    right: 18,
    backgroundColor: colors.brandMutedSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold, color: colors.brandPrimary },
  barBg: { height: 8, backgroundColor: colors.brandTrack, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.brandPrimary, borderRadius: 999 },
});
