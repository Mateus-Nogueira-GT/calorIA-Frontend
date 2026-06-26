import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton } from '@shared/components';
import { colors, spacing, radius } from '@theme';

export function PostCardSkeleton(): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={28} height={28} radius={14} />
        <Skeleton width={120} height={14} />
      </View>
      <Skeleton width="92%" height={12} style={styles.line} />
      <Skeleton width="60%" height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  line: { marginBottom: 10 },
});
