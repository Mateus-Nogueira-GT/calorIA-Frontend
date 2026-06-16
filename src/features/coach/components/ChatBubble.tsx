import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

interface Props {
  message: string;
  role: 'coach' | 'user';
  timestamp: Date;
}

export function ChatBubble({ message, role, timestamp }: Props): React.JSX.Element {
  const time = timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (role === 'coach') {
    return (
      <View style={styles.coachRow}>
        <Avatar size="sm" emoji="🤖" />
        <View style={styles.coachWrap}>
          <View style={styles.coachBubble}>
            <Text variant="body">{message}</Text>
          </View>
          <Text variant="caption" style={styles.time}>{time}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.userRow}>
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text variant="body" color={colors.white}>{message}</Text>
        </View>
        <Text variant="caption" style={[styles.time, styles.timeRight]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coachRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 16 },
  coachWrap: { flex: 1, maxWidth: '80%' },
  coachBubble: {
    backgroundColor: colors.surface,
    borderRadius: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 12,
  },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userWrap: { maxWidth: '80%', alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
  },
  time: { marginTop: 4, color: colors.textDisabled },
  timeRight: { alignSelf: 'flex-end' },
});
