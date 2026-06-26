import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { CoachMark } from './CoachMark';

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
        <CoachMark size='sm' />
        <View style={styles.coachWrap}>
          <Text style={styles.senderLabel}>Coach IA</Text>
          <View style={styles.coachBubble}>
            <Text style={styles.coachMessage}>{message}</Text>
          </View>
          <Text variant="caption" style={styles.time}>{time}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.userRow}>
      <View style={styles.userWrap}>
        <Text style={[styles.senderLabel, styles.senderLabelUser]}>Voce</Text>
        <View style={styles.userBubble}>
          <Text style={styles.userMessage}>{message}</Text>
        </View>
        <Text variant="caption" style={[styles.time, styles.timeRight]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coachRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: spacing.lg },
  coachWrap: { flex: 1, maxWidth: '86%' },
  coachBubble: {
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    borderRadius: 18,
    borderTopLeftRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
  },
  coachMessage: {
    color: colors.brandText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
  },
  userRow: { alignItems: 'flex-end', marginBottom: spacing.lg },
  userWrap: { maxWidth: '80%', alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: colors.brandAnchor,
    borderRadius: 18,
    borderTopRightRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
  },
  userMessage: {
    color: colors.brandBackground,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
  },
  senderLabel: {
    marginBottom: 6,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.xs,
  },
  senderLabelUser: { textAlign: 'right' },
  time: { marginTop: 5, color: colors.brandTextMuted },
  timeRight: { alignSelf: 'flex-end' },
});
