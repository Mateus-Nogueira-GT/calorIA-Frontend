import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography, radius } from '@theme';

interface Props {
  count: number;
  onPress: () => void;
}

export function NotificationBell({ count, onPress }: Props): React.JSX.Element {
  return (
    <Pressable testID='notification-bell' onPress={onPress} accessibilityRole='button' accessibilityLabel='Notificações' hitSlop={8}>
      <Text style={styles.icon}>🔔</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: radius.sm,
    paddingHorizontal: 3,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold },
});
