import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface ProfileMenuItemProps {
  label: string;
  description?: string;
  onPress: () => void;
  destructive?: boolean;
  testID?: string;
}

export function ProfileMenuItem({
  label,
  description,
  onPress,
  destructive,
  testID,
}: ProfileMenuItemProps): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} testID={testID} activeOpacity={0.7}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
        {description ? (
          <Text style={[styles.description, destructive && styles.destructive]}>{description}</Text>
        ) : null}
      </View>
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
  textBlock: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
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
