import { create } from 'zustand';
import {
  feedService,
  Post,
  Comment,
  PostAchievement,
} from '@shared/services/feed.service';
import { showAlert } from '@shared/utils/show-alert';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

interface FeedState {
  posts: Post[];
  nextCursor: string | null;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isCreating: boolean;
  commentsByPost: Record<string, Comment[]>;
  loadingCommentsByPost: Record<string, boolean>;
  /** A última carga de comentários daquele post falhou. */
  commentsErrorByPost: Record<string, boolean>;

  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createPost: (content: string, achievement?: PostAchievement) => Promise<Post>;
  toggleLike: (postId: string) => Promise<void>;
  loadComments: (postId: string) => Promise<void>;
  addComment: (postId: string, content: string) => Promise<void>;
  clear: () => void;
}

const initialState = {
  posts: [] as Post[],
  nextCursor: null as string | null,
  isLoadingInitial: false,
  isLoadingMore: false,
  isRefreshing: false,
  isCreating: false,
  commentsByPost: {} as Record<string, Comment[]>,
  loadingCommentsByPost: {} as Record<string, boolean>,
  commentsErrorByPost: {} as Record<string, boolean>,
};

// S7: posts com curtida/descurtida em andamento. Dois toques rápidos mandavam
// POST e DELETE em paralelo, e a resposta que chegasse por último decidia a tela.
const likesInFlight = new Set<string>();

export const useFeedStore = create<FeedState>((set, get) => ({
  ...initialState,

  // S10: a resposta que chega depois de trocar de conta é da conta anterior —
  // o logout já limpou o store, e ela não pode repopular o feed da seguinte.
  loadInitial: async () => {
    const owner = captureSessionOwner();
    set({ isLoadingInitial: true });
    try {
      const page = await feedService.getFeed();
      if (!isCurrentOwner(owner)) return;
      set({ posts: page.posts, nextCursor: page.nextCursor, isLoadingInitial: false });
    } catch (e) {
      if (!isCurrentOwner(owner)) return;
      set({ isLoadingInitial: false });
      throw e;
    }
  },

  loadMore: async () => {
    const { nextCursor, isLoadingMore } = get();
    if (nextCursor === null || isLoadingMore) return;
    const owner = captureSessionOwner();
    set({ isLoadingMore: true });
    try {
      const page = await feedService.getFeed(nextCursor);
      if (!isCurrentOwner(owner)) return;
      set((s) => ({
        posts: [...s.posts, ...page.posts],
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch {
      if (isCurrentOwner(owner)) set({ isLoadingMore: false });
    }
  },

  refresh: async () => {
    const owner = captureSessionOwner();
    set({ isRefreshing: true });
    try {
      const page = await feedService.getFeed();
      if (!isCurrentOwner(owner)) return;
      set({ posts: page.posts, nextCursor: page.nextCursor, isRefreshing: false });
    } catch {
      if (isCurrentOwner(owner)) set({ isRefreshing: false });
    }
  },

  createPost: async (content, achievement) => {
    set({ isCreating: true });
    try {
      const created = await feedService.createPost({ content, achievement });
      set((s) => ({ posts: [created, ...s.posts], isCreating: false }));
      return created;
    } catch (e) {
      // M3: antes o catch da tela dizia "Alert já disparado no store", mas o
      // store só relançava — o usuário via o spinner parar e mais nada.
      set({ isCreating: false });
      showAlert('Não foi possível publicar', 'Verifique sua conexão e tente novamente.');
      throw e;
    }
  },

  toggleLike: async (postId) => {
    const target = get().posts.find((p) => p.id === postId);
    if (!target || likesInFlight.has(postId)) return;
    likesInFlight.add(postId);
    const snapshot = { likedByMe: target.likedByMe, likeCount: target.likeCount };
    const optimistic = {
      likedByMe: !snapshot.likedByMe,
      likeCount: snapshot.likeCount + (snapshot.likedByMe ? -1 : 1),
    };
    set((s) => ({
      posts: s.posts.map((p) => (p.id === postId ? { ...p, ...optimistic } : p)),
    }));
    try {
      const res = snapshot.likedByMe
        ? await feedService.unlike(postId)
        : await feedService.like(postId);
      set((s) => ({
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, likeCount: res.likeCount, likedByMe: res.likedByMe } : p,
        ),
      }));
    } catch (e) {
      set((s) => ({
        posts: s.posts.map((p) => (p.id === postId ? { ...p, ...snapshot } : p)),
      }));
      showAlert('Não foi possível curtir', 'Tente novamente.');
      throw e;
    } finally {
      likesInFlight.delete(postId);
    }
  },

  loadComments: async (postId) => {
    set((s) => ({
      loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: true },
      commentsErrorByPost: { ...s.commentsErrorByPost, [postId]: false },
    }));
    try {
      const comments = await feedService.getComments(postId);
      set((s) => ({
        commentsByPost: { ...s.commentsByPost, [postId]: comments },
        loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: false },
      }));
    } catch {
      // Sem esse estado a tela exibia "Seja o primeiro a comentar." num post
      // com 12 comentários — afirmação falsa e sem como recarregar.
      set((s) => ({
        loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: false },
        commentsErrorByPost: { ...s.commentsErrorByPost, [postId]: true },
      }));
    }
  },

  addComment: async (postId, content) => {
    const tempId = `temp-${Date.now()}`;
    const target = get().posts.find((p) => p.id === postId);
    const optimistic: Comment = {
      id: tempId,
      postId,
      author: { id: 'me', name: 'Você' },
      content,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      commentsByPost: {
        ...s.commentsByPost,
        [postId]: [...(s.commentsByPost[postId] ?? []), optimistic],
      },
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
      ),
    }));
    try {
      const saved = await feedService.addComment(postId, content);
      set((s) => ({
        commentsByPost: {
          ...s.commentsByPost,
          [postId]: (s.commentsByPost[postId] ?? []).map((c) => (c.id === tempId ? saved : c)),
        },
      }));
    } catch (e) {
      set((s) => ({
        commentsByPost: {
          ...s.commentsByPost,
          [postId]: (s.commentsByPost[postId] ?? []).filter((c) => c.id !== tempId),
        },
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
        ),
      }));
      showAlert('Não foi possível comentar', 'Tente novamente.');
      throw e;
    }
    void target; // contador já ajustado acima
  },

  clear: () => set({ ...initialState }),
}));
