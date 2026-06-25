import React, { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useNotificationsStore } from '../store';
import { NotificationRow } from '../components/NotificationRow';
import type { AppNotification } from '@shared/services/notifications.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Notifications'>;

function targetFor(n: AppNotification): { screen: 'PostComments' | 'ChallengeLeaderboard'; params: object } | null {
  if (!n.targetId) return null;
  if (n.type === 'like' || n.type === 'comment') return { screen: 'PostComments', params: { postId: n.targetId } };
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

  useEffect(() => {
    load();
  }, [load]);

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
          <Pressable onPress={() => markAllRead()} accessibilityRole='button' hitSlop={8}>
            <Text style={styles.action}>Marcar todas como lidas</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.brandPrimary} style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationRow notification={item} onPress={() => onPressItem(item)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma notificação por aqui.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  action: { fontSize: 13, color: colors.brandPrimary, fontFamily: typography.fontFamily.semiBold },
  loader: { marginTop: 32 },
  separator: { height: 1, backgroundColor: colors.brandDivider, marginLeft: 16 },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: 48, fontSize: 14 },
});
