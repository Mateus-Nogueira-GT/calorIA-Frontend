import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, spacing, typography } from '@theme';

interface ProfileHeaderProps {
  name: string;
  email: string;
  avatarUri?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'U';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function ProfileHeader({ name, email, avatarUri }: ProfileHeaderProps): React.JSX.Element {
  const initials = getInitials(name);
  const showSecondary = email || 'Conta CalorIA';

  return (
    <View style={styles.container}>
      <View style={styles.identityRow}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            accessibilityLabel={name ? `Foto de perfil de ${name}` : 'Foto de perfil'}
            style={styles.avatarImage}
          />
        ) : (
          <View style={styles.avatar} accessibilityLabel={name ? `Avatar de ${name}` : 'Avatar do usuario'}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.name}>{name || 'Sua conta'}</Text>
          <Text numberOfLines={1} style={styles.email}>{showSecondary}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandAnchor,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarImage: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandMutedSurface },
  avatarInitials: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandBackground,
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandTextMuted,
  },
});
