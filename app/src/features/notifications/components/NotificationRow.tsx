import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Avatar } from '@shared/components/Avatar';
import { timeAgo } from '@shared/utils/date';
import type { AppNotification } from '@shared/services/notifications.service';

interface Props {
  notification: AppNotification;
  onPress: () => void;
}

export function NotificationRow({ notification, onPress }: Props): React.JSX.Element {
  return (
    <Pressable
      testID='notification-row'
      onPress={onPress}
      accessibilityRole='button'
      accessibilityState={{ selected: !notification.read }}
      style={[styles.row, !notification.read && styles.rowUnread]}
    >
      <Avatar size='sm' emoji={notification.actor.avatarEmoji ?? '🙂'} backgroundColor={colors.brandMutedSurface} />
      <View style={styles.body}>
        <Text style={styles.text}>
          <Text style={styles.actor}>{notification.actor.name}</Text> {notification.message}
        </Text>
        <Text style={styles.time}>{timeAgo(notification.createdAt)}</Text>
      </View>
      {!notification.read ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  rowUnread: { backgroundColor: colors.brandMutedSurface },
  body: { flex: 1 },
  text: { fontSize: typography.fontSize.base, color: colors.brandText, lineHeight: 20 },
  actor: { color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
});
