import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface ProfileHeaderProps {
  name: string;
  email: string;
}

export function ProfileHeader({ name, email }: ProfileHeaderProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>😊</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.email}>{email}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarEmoji: {
    fontSize: 40,
  },
  name: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
});
