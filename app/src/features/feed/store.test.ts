import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFeedStore } from './store';
import { useAuthStore } from '@features/auth/store';
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
      await result.current.createPost('meu post', undefined).catch(() => {});
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

  it('dois toques rápidos na curtida geram uma requisição só (S7)', async () => {
    useFeedStore.setState({ posts: [post('p1')] });
    let resolveLike!: (v: { likeCount: number; likedByMe: boolean }) => void;
    feedService.like.mockReturnValue(
      new Promise((r) => {
        resolveLike = r;
      }),
    );

    const first = useFeedStore.getState().toggleLike('p1');
    const second = useFeedStore.getState().toggleLike('p1');
    expect(feedService.like).toHaveBeenCalledTimes(1);
    expect(feedService.unlike).not.toHaveBeenCalled();

    resolveLike({ likeCount: 1, likedByMe: true });
    await Promise.all([first, second]);
    expect(useFeedStore.getState().posts[0]).toMatchObject({ likedByMe: true, likeCount: 1 });

    // Terminada a requisição, o próximo toque volta a valer.
    feedService.unlike.mockResolvedValue({ likeCount: 0, likedByMe: false });
    await useFeedStore.getState().toggleLike('p1');
    expect(feedService.unlike).toHaveBeenCalledTimes(1);
  });

  describe('troca de conta com o feed pendente (S10)', () => {
    const USER_A = { id: 'uA', name: 'A', email: 'a@exemplo.com' };
    const USER_B = { id: 'uB', name: 'B', email: 'b@exemplo.com' };
    beforeEach(() => {
      useAuthStore.getState().clearToken();
      useAuthStore.getState().setToken('token-a', USER_A, 'refresh-a');
    });
    const switchAccount = () => {
      useAuthStore.getState().clearToken();
      useAuthStore.getState().setToken('token-b', USER_B, 'refresh-b');
    };
    const pendingPage = () => {
      let resolve!: (p: FeedPage) => void;
      feedService.getFeed.mockReturnValue(
        new Promise<FeedPage>((r) => {
          resolve = r;
        }),
      );
      return (page: FeedPage) => resolve(page);
    };

    it('loadInitial descarta a resposta da conta anterior', async () => {
      const resolve = pendingPage();
      const loading = useFeedStore.getState().loadInitial();
      switchAccount();
      resolve({ posts: [post('pA')], nextCursor: 'cA' });
      await loading;
      expect(useFeedStore.getState().posts).toEqual([]);
      expect(useFeedStore.getState().nextCursor).toBeNull();
    });

    it('refresh descarta a resposta da conta anterior', async () => {
      const resolve = pendingPage();
      const loading = useFeedStore.getState().refresh();
      switchAccount();
      resolve({ posts: [post('pA')], nextCursor: null });
      await loading;
      expect(useFeedStore.getState().posts).toEqual([]);
    });

    it('loadMore não anexa posts da conta anterior', async () => {
      useFeedStore.setState({ posts: [post('p1')], nextCursor: 'c1' });
      const resolve = pendingPage();
      const loading = useFeedStore.getState().loadMore();
      switchAccount();
      resolve({ posts: [post('pA')], nextCursor: null });
      await loading;
      expect(useFeedStore.getState().posts).toEqual([]);
    });

    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((a, b) => {
        resolve = a;
        reject = b;
      });
      return { promise, resolve, reject };
    };
    const comment = (id: string): Comment => ({
      id,
      postId: 'p1',
      author,
      content: 'oi',
      createdAt: '2026-11-26T10:00:00Z',
    });

    it('R5: publicação da conta anterior não entra no feed da próxima', async () => {
      const pending = deferred<Post>();
      feedService.createPost.mockReturnValue(pending.promise);
      const creating = useFeedStore.getState().createPost('post de A');
      switchAccount();
      pending.resolve(post('pA'));
      await creating.catch(() => undefined);
      expect(useFeedStore.getState()).toMatchObject({ posts: [], isCreating: false });
    });

    it('R5: falha da publicação da conta anterior não avisa a próxima', async () => {
      const pending = deferred<Post>();
      feedService.createPost.mockReturnValue(pending.promise);
      const creating = useFeedStore.getState().createPost('post de A');
      switchAccount();
      pending.reject(new Error('cancelada'));
      await creating.catch(() => undefined);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('R5: curtida da conta anterior não altera o mesmo post no feed da próxima', async () => {
      useFeedStore.setState({ posts: [post('p1', { likeCount: 4 })] });
      const pending = deferred<{ likeCount: number; likedByMe: boolean }>();
      feedService.like.mockReturnValue(pending.promise);
      const liking = useFeedStore.getState().toggleLike('p1');
      switchAccount();
      useFeedStore.setState({ posts: [post('p1', { likeCount: 7 })] });
      pending.resolve({ likeCount: 5, likedByMe: true });
      await liking;
      expect(useFeedStore.getState().posts[0]).toMatchObject({ likeCount: 7, likedByMe: false });
    });

    it('R5: rollback da curtida da conta anterior não restaura os dados dela', async () => {
      useFeedStore.setState({ posts: [post('p1', { likeCount: 4, likedByMe: true })] });
      const pending = deferred<{ likeCount: number; likedByMe: boolean }>();
      feedService.unlike.mockReturnValue(pending.promise);
      const liking = useFeedStore.getState().toggleLike('p1');
      switchAccount();
      useFeedStore.setState({ posts: [post('p1', { likeCount: 7 })] });
      pending.reject(new Error('cancelada'));
      await liking.catch(() => undefined);
      expect(useFeedStore.getState().posts[0]).toMatchObject({ likeCount: 7, likedByMe: false });
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('R5: comentários da conta anterior não entram no store da próxima', async () => {
      const pending = deferred<Comment[]>();
      feedService.getComments.mockReturnValue(pending.promise);
      const loading = useFeedStore.getState().loadComments('p1');
      switchAccount();
      pending.resolve([comment('cA')]);
      await loading;
      expect(useFeedStore.getState().commentsByPost).toEqual({});
      expect(useFeedStore.getState().loadingCommentsByPost).toEqual({});
    });

    it('R5: comentário da conta anterior não grava nem reverte na próxima', async () => {
      useFeedStore.setState({ posts: [post('p1', { commentCount: 1 })] });
      const saved = deferred<Comment>();
      feedService.addComment.mockReturnValue(saved.promise);
      const adding = useFeedStore.getState().addComment('p1', 'de A');
      switchAccount();
      saved.resolve(comment('cA'));
      await adding;
      expect(useFeedStore.getState().commentsByPost).toEqual({});

      useFeedStore.setState({ posts: [post('p1', { commentCount: 1 })] });
      const failed = deferred<Comment>();
      feedService.addComment.mockReturnValue(failed.promise);
      const failing = useFeedStore.getState().addComment('p1', 'de B');
      switchAccount();
      useFeedStore.setState({ posts: [post('p1', { commentCount: 3 })] });
      failed.reject(new Error('cancelada'));
      await failing.catch(() => undefined);
      expect(useFeedStore.getState().posts[0].commentCount).toBe(3);
      expect(useFeedStore.getState().commentsByPost).toEqual({});
      expect(showAlert).not.toHaveBeenCalled();
    });
  });
});
