import { useFeedStore } from '../store';

export function useFeed() {
  const posts = useFeedStore((s) => s.posts);
  const isLoadingInitial = useFeedStore((s) => s.isLoadingInitial);
  const isLoadingMore = useFeedStore((s) => s.isLoadingMore);
  const isRefreshing = useFeedStore((s) => s.isRefreshing);
  const nextCursor = useFeedStore((s) => s.nextCursor);
  const loadInitial = useFeedStore((s) => s.loadInitial);
  const loadMore = useFeedStore((s) => s.loadMore);
  const refresh = useFeedStore((s) => s.refresh);
  const toggleLike = useFeedStore((s) => s.toggleLike);

  return {
    posts,
    isLoadingInitial,
    isLoadingMore,
    isRefreshing,
    loadInitial,
    loadMore,
    refresh,
    toggleLike,
    isEmpty: !isLoadingInitial && posts.length === 0,
    hasMore: nextCursor !== null,
  };
}
