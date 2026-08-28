import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFeedStore } from './store';
import type { Post, FeedPage, Comment } from '@shared/services/feed.service';

const author = { id: 'u1', name: 'Ana' };
const post = (id: string, over: Partial<Post> = {}): Post => ({
  id,
  author,
  content: 'oi',
  achievement: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  createdAt: '2026-06-24T10:00:00Z',
  ...over,
});

jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { showAlert } = require('@shared/utils/show-alert');

jest.mock('@shared/services/feed.service', () => ({
  feedService: {
    getFeed: jest.fn(),
    createPost: jest.fn(),
    like: jest.fn(),
    unlike: jest.fn(),
    getComments: jest.fn(),
    addComment: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { feedService } = require('@shared/services/feed.service');

describe('useFeedStore', () => {
  beforeEach(() => {
    useFeedStore.setState({
      posts: [],
      nextCursor: null,
      isLoadingInitial: false,
      isLoadingMore: false,
      isRefreshing: false,
      isCreating: false,
      commentsByPost: {},
      loadingCommentsByPost: {},
    });
    jest.clearAllMocks();
  });

  it('loadInitial popula posts e cursor', async () => {
    const page: FeedPage = { posts: [post('p1')], nextCursor: 'c1' };
    feedService.getFeed.mockResolvedValue(page);
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.loadInitial());
    expect(result.current.posts).toHaveLength(1);
    expect(result.current.nextCursor).toBe('c1');
  });

  it('loadMore concatena e respeita nextCursor null', async () => {
    useFeedStore.setState({ posts: [post('p1')], nextCursor: 'c1' });
    feedService.getFeed.mockResolvedValue({ posts: [post('p2')], nextCursor: null });
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.loadMore());
    expect(result.current.posts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(result.current.nextCursor).toBeNull();
    await act(() => result.current.loadMore()); // no-op no fim
    expect(feedService.getFeed).toHaveBeenCalledTimes(1);
  });

  it('createPost faz unshift do novo post', async () => {
    useFeedStore.setState({ posts: [post('p1')] });
    feedService.createPost.mockResolvedValue(post('p2', { content: 'novo' }));
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.createPost('novo'));
    expect(result.current.posts[0].id).toBe('p2');
  });

  it('toggleLike aplica otimista e substitui pela resposta', async () => {
    useFeedStore.setState({ posts: [post('p1', { likeCount: 2, likedByMe: false })] });
    feedService.like.mockResolvedValue({ likeCount: 3, likedByMe: true });
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.toggleLike('p1'));
    expect(result.current.posts[0].likedByMe).toBe(true);
    expect(result.current.posts[0].likeCount).toBe(3);
  });

  it('toggleLike reverte em erro', async () => {
    useFeedStore.setState({ posts: [post('p1', { likeCount: 2, likedByMe: false })] });
    feedService.like.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useFeedStore());
    await act(async () => {
      try {
        await result.current.toggleLike('p1');
      } catch {
        /* expected */
      }
    });
    expect(result.current.posts[0].likedByMe).toBe(false);
    expect(result.current.posts[0].likeCount).toBe(2);
  });

  it('addComment otimista incrementa contador e troca pelo canônico', async () => {
    useFeedStore.setState({ posts: [post('p1', { commentCount: 0 })], commentsByPost: { p1: [] } });
    const saved: Comment = { id: 'real', postId: 'p1', author, content: 'c', createdAt: '2026-06-24T10:01:00Z' };
    feedService.addComment.mockResolvedValue(saved);
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.addComment('p1', 'c'));
    expect(result.current.posts[0].commentCount).toBe(1);
    expect(result.current.commentsByPost.p1.at(-1)?.id).toBe('real');
  });

  it('clear zera o estado', () => {
    useFeedStore.setState({ posts: [post('p1')], nextCursor: 'c1' });
    useFeedStore.getState().clear();
    expect(useFeedStore.getState().posts).toEqual([]);
    expect(useFeedStore.getState().nextCursor).toBeNull();
  });

  it('avisa o usuário quando publicar falha (M3)', async () => {
    // A tela dizia no comentário que "o Alert já foi disparado no store", mas o
    // store só relançava: o spinner parava e nada acontecia na frente do usuário.
    feedService.createPost.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFeedStore());

    await act(async () => {
      await result.current.createPost('meu post', null).catch(() => {});
    });

    expect(showAlert).toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
  });

  it('marca erro quando os comentários não carregam (M5)', async () => {
    feedService.getComments.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFeedStore());

    await act(() => result.current.loadComments('p1'));

    // Sem isso a tela mostrava "Seja o primeiro a comentar." num post que tem
    // comentários — afirmação falsa e sem como recarregar.
    expect(result.current.commentsErrorByPost['p1']).toBe(true);
    expect(result.current.loadingCommentsByPost['p1']).toBe(false);
  });

  it('limpa o erro dos comentários ao recarregar com sucesso', async () => {
    feedService.getComments.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useFeedStore());
    await act(() => result.current.loadComments('p1'));
    expect(result.current.commentsErrorByPost['p1']).toBe(true);

    feedService.getComments.mockResolvedValue([] as Comment[]);
    await act(() => result.current.loadComments('p1'));

    expect(result.current.commentsErrorByPost['p1']).toBe(false);
  });
});