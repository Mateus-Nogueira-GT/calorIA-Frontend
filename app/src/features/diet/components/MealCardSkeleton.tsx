import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '@shared/components';
import { colors, radius, spacing } from '@theme';

export function MealCardSkeleton(): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton height={16} style={styles.titleFlex} />
        <Skeleton width={64} height={14} />
      </View>
      <View style={styles.chipsRow}>
        <Skeleton width={56} height={24} />
        <Skeleton width={56} height={24} />
        <Skeleton width={78} height={24} />
      </View>
      <Skeleton width="92%" height={12} style={styles.itemLine} />
      <Skeleton width="68%" height={12} style={styles.itemLineShort} />
      <Skeleton height={40} style={styles.buttonBlock} radius={radius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  titleFlex: { flex: 1 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  itemLine: { marginBottom: 10 },
  itemLineShort: { marginBottom: 14 },
  buttonBlock: { width: '100%' },
});
