import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';

interface StreakBadgeProps {
  days: number;
}

export function StreakBadge({ days }: StreakBadgeProps): React.JSX.Element {
  const label = days === 1 ? 'dia seguido' : 'dias seguidos';
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <View style={styles.markStem} />
        <View style={styles.markLeaf} />
      </View>
      <Text style={styles.text}>{days} {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mark: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markStem: {
    position: 'absolute',
    width: 4,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  markLeaf: {
    width: 10,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSupport,
    transform: [{ rotate: '-28deg' }, { translateX: 2 }],
  },
  text: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
