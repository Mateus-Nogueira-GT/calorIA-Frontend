import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from '@shared/components';
import { colors, spacing, radius } from '@theme';

interface Props {
  message: string;
  role: 'coach' | 'user';
}

export function OnboardingChatBubble({ message, role }: Props): React.JSX.Element {
  if (role === 'coach') {
    return (
      <View style={styles.coachRow}>
        <Avatar size="sm" emoji="🤖" />
        <View style={styles.coachBubble}>
          <Text variant="body">{message}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text variant="body" color={colors.white}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coachRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.md },
  coachBubble: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    padding: spacing.md,
    maxWidth: '80%',
  },
  userRow: { alignItems: 'flex-end', marginBottom: spacing.md },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    borderTopRightRadius: 4,
    padding: spacing.md,
    maxWidth: '80%',
  },
});
