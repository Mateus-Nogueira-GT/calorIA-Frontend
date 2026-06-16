import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface ProfileMenuItemProps {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

export function ProfileMenuItem({ label, onPress, destructive, testID }: ProfileMenuItemProps): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} testID={testID} activeOpacity={0.7}>
      <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
      <Text style={[styles.chevron, destructive && styles.destructive]}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    flex: 1,
  },
  destructive: {
    color: colors.error,
  },
  chevron: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    marginLeft: 8,
  },
});
