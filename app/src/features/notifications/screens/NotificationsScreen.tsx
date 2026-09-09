import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { screenShellStyle } from '@shared/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { useNotificationsStore } from '../store';
import { NotificationRow } from '../components/NotificationRow';
import { ErrorState } from '@shared/components';
import type { AppNotification } from '@shared/services/notifications.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Notifications'>;

function targetFor(
  n: AppNotification,
): { screen: 'PostComments' | 'ChallengeLeaderboard' | 'Friends'; params: object } | null {
  // Amizade navega mesmo sem targetId (a tela de destino carrega tudo).
  if (n.type === 'friend_request') return { screen: 'Friends', params: { initialTab: 'requests' } };
  if (n.type === 'friend_accepted') return { screen: 'Friends', params: { initialTab: 'friends' } };
  if (!n.targetId) return null;
  if (n.type === 'like' || n.type === 'comment')
    return { screen: 'PostComments', params: { postId: n.targetId } };
  if (n.type === 'challenge_invite' || n.type === 'challenge_rank')
    return { screen: 'ChallengeLeaderboard', params: { challengeId: n.targetId } };
  return null;
}

export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const isLoading = useNotificationsStore((s) => s.isLoading);
  const load = useNotificationsStore((s) => s.load);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    load().catch(() => setHasError(true));
  }, [load]);

  const reload = () => {
    setHasError(false);
    load().catch(() => setHasError(true));
  };

  const onPressItem = (n: AppNotification) => {
    markRead(n.id);
    const dest = targetFor(n);
    if (dest) navigation.navigate(dest.screen, dest.params as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Notificações</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={() => markAllRead()} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.action}>Marcar todas como lidas</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.brandPrimary} style={styles.loader} />
      ) : hasError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotificationRow notification={item} onPress={() => onPressItem(item)} />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma notificação por aqui.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: screenShellStyle,
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  action: {
    fontSize: typography.fontSize.sm,
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.semiBold,
  },
  loader: { marginTop: spacing.xxxl },
  separator: { height: 1, backgroundColor: colors.brandDivider, marginLeft: spacing.lg },
  empty: {
    textAlign: 'center',
    color: colors.brandTextMuted,
    marginTop: 48,
    fontSize: typography.fontSize.base,
  },
});
