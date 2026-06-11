import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

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
  coachRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 12 },
  coachBubble: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 12,
    maxWidth: '80%',
  },
  userRow: { alignItems: 'flex-end', marginBottom: 12 },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    maxWidth: '80%',
  },
});
