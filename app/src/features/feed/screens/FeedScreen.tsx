import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { screenShellStyle } from '@shared/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { useFeed } from '../hooks/useFeed';
import { useFeedStore } from '../store';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/PostCardSkeleton';
import { EmptyFeedState } from '../components/EmptyFeedState';
import { NotificationBell } from '@features/notifications/components/NotificationBell';
import { useNotificationsStore } from '@features/notifications/store';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Feed'>;

export function FeedScreen({ navigation }: Props): React.JSX.Element {
  const {
    posts,
    isLoadingInitial,
    isLoadingMore,
    isRefreshing,
    loadInitial,
    loadMore,
    refresh,
    toggleLike,
    isEmpty,
  } = useFeed();
  const [hasError, setHasError] = useState(false);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  useEffect(() => {
    if (useFeedStore.getState().posts.length === 0) {
      loadInitial().catch(() => {
        setHasError(true);
      });
    }
  }, [loadInitial]);

  const goCreate = () => navigation.navigate('CreatePost');
  const goChallenges = () => navigation.navigate('Challenges');
  const goNotifications = () => navigation.navigate('Notifications');
  const goFriends = () => navigation.navigate('Friends', undefined);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Comunidade</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={goFriends} accessibilityRole='button' accessibilityLabel='Amigos' style={styles.headerAction} testID='feed-friends-button'>
            <Text style={styles.headerActionIcon}>👥</Text>
          </Pressable>
          <Pressable onPress={goChallenges} accessibilityRole='button' accessibilityLabel='Desafios' style={styles.headerAction}>
            <Text style={styles.headerActionIcon}>🏆</Text>
          </Pressable>
          <NotificationBell count={unreadCount} onPress={goNotifications} />
        </View>
      </View>

      {isLoadingInitial ? (
        <View style={styles.listContent}>
          {[0, 1, 2].map((i) => (
            <PostCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onToggleLike={(id) => toggleLike(id).catch(() => {})}
              onPressComments={(id) => navigation.navigate('PostComments', { postId: id })}
            />
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => loadMore()}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                // L3: sem limpar, um refresh bem-sucedido que devolve feed
                // legitimamente vazio continuava exibindo o estado de ERRO em
                // vez do vazio com CTA de encontrar amigos.
                setHasError(false);
                void Promise.resolve(refresh()).catch(() => setHasError(true));
              }}
              tintColor={colors.brandPrimary}
            />
          }
          ListEmptyComponent={
            hasError ? (
              <EmptyFeedState
                mode="error"
                onRetry={() => {
                  setHasError(false);
                  loadInitial().catch(() => {
                    setHasError(true);
                  });
                }}
              />
            ) : isEmpty ? (
              <EmptyFeedState mode="empty" onCreate={goCreate} onFindFriends={goFriends} />
            ) : null
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={colors.brandPrimary} style={styles.footer} />
            ) : null
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={goCreate}
        accessibilityRole="button"
        accessibilityLabel="Criar post"
      >
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: typography.fontSize.xl, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerAction: { padding: spacing.xs },
  headerActionIcon: { fontSize: 22 },
  listContent: { ...screenShellStyle, paddingHorizontal: spacing.lg, paddingBottom: 96, flexGrow: 1 },
  footer: { paddingVertical: spacing.lg },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  fabIcon: { fontSize: 28, color: colors.white, lineHeight: 30 },
});
