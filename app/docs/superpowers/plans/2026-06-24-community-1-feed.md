# Comunidade — Plano 1: Fundação + Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o feed social funcional — listar posts com scroll infinito, criar post (texto + conquista), curtir (com animação) e comentar — com a 6ª aba "Comunidade" e mocks MSW.

**Architecture:** Nova feature `src/features/feed` (service thin sobre axios → store Zustand com updates otimistas → componentes → telas), exposta por um `CommunityNavigator` (native-stack) montado numa nova aba do `BrandTabNavigator`. Backend mockado via handlers MSW. Segue 1:1 os padrões da feature `diet`.

**Tech Stack:** React Native 0.76, TypeScript, Zustand, axios, React Navigation (native-stack + bottom-tabs), MSW, Jest + @testing-library/react-native, Animated API nativa.

## Global Constraints

- **Cores:** usar exclusivamente tokens de `src/theme/colors.ts` — nenhuma cor nova hardcoded. Mapa: fundo `brandBackground`, superfície de card `colors.white` (via `Card`), CTA/coração/ponto não-lida `brandPrimary` (#FF6B35), nomes/headers `brandAnchor` (#1B2D5B), badge/conquista `brandSupport`/`brandSupportSoft` (#FFB347), texto `brandText`/`brandTextMuted`, divisores `brandDivider`.
- **Tipografia/raios:** via `src/theme/typography.ts` e componentes base (`Card` r16, `Button` r12, `Text`, `Avatar`, `Input`).
- **Stores:** padrão `zustand.create`; services são wrappers finos (`api.get(...).then(r => r.data)`); updates otimistas sempre com snapshot + rollback + `Alert.alert` em erro (espelhar `src/features/diet/store.ts`).
- **Testes de store:** `jest.mock('@shared/services/<x>.service', ...)`, `renderHook` + `act`, reset via `setState` em `beforeEach` (espelhar `src/features/diet/store.test.ts`).
- **Imports:** usar aliases `@features`, `@shared`, `@theme`, `@navigation`, `@env`.
- **Idioma:** toda copy visível ao usuário em PT-BR.
- **MSW:** novos handlers registrados em `mocks/server.ts`.

---

### Task 1: Tipos e service do feed + util de tempo relativo

**Files:**
- Create: `src/shared/services/feed.service.ts`
- Modify: `src/shared/utils/date.ts` (append `timeAgo`)
- Test: `src/shared/utils/date.test.ts` (append casos de `timeAgo`)

**Interfaces:**
- Produces:
  - Tipos: `AchievementType`, `PostAuthor`, `PostAchievement`, `Post`, `Comment`, `FeedPage`
  - `feedService.getFeed(cursor?: string, limit?: number): Promise<FeedPage>`
  - `feedService.createPost(input: { content: string; achievement?: PostAchievement }): Promise<Post>`
  - `feedService.like(postId: string): Promise<{ likeCount: number; likedByMe: boolean }>`
  - `feedService.unlike(postId: string): Promise<{ likeCount: number; likedByMe: boolean }>`
  - `feedService.getComments(postId: string): Promise<Comment[]>`
  - `feedService.addComment(postId: string, content: string): Promise<Comment>`
  - `timeAgo(iso: string, now?: Date): string`

- [ ] **Step 1: Write the failing test** (append em `src/shared/utils/date.test.ts`)

```ts
import { timeAgo } from './date';

describe('timeAgo', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('retorna "agora" para menos de 1 minuto', () => {
    expect(timeAgo('2026-06-24T11:59:30Z', now)).toBe('agora');
  });

  it('retorna minutos', () => {
    expect(timeAgo('2026-06-24T11:45:00Z', now)).toBe('há 15min');
  });

  it('retorna horas', () => {
    expect(timeAgo('2026-06-24T09:00:00Z', now)).toBe('há 3h');
  });

  it('retorna dias', () => {
    expect(timeAgo('2026-06-22T12:00:00Z', now)).toBe('há 2d');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/shared/utils/date.test.ts -t timeAgo`
Expected: FAIL — `timeAgo is not a function`.

- [ ] **Step 3: Implement `timeAgo`** (append em `src/shared/utils/date.ts`)

```ts
export function timeAgo(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/shared/utils/date.test.ts -t timeAgo`
Expected: PASS.

- [ ] **Step 5: Create the service**

Create `src/shared/services/feed.service.ts`:

```ts
import api from './api';

export type AchievementType = 'meal_logged' | 'diet_completed' | 'streak';

export interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}

export interface PostAchievement {
  type: AchievementType;
  emoji: string;
  title: string;
  subtitle: string;
}

export interface Post {
  id: string;
  author: PostAuthor;
  content: string;
  achievement: PostAchievement | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: PostAuthor;
  content: string;
  createdAt: string;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

export interface LikeResult {
  likeCount: number;
  likedByMe: boolean;
}

export const feedService = {
  getFeed: (cursor?: string, limit = 10) =>
    api
      .get<FeedPage>('/feed', { params: { cursor, limit } })
      .then((r) => r.data),
  createPost: (input: { content: string; achievement?: PostAchievement }) =>
    api.post<Post>('/posts', input).then((r) => r.data),
  like: (postId: string) =>
    api.post<LikeResult>(`/posts/${postId}/like`).then((r) => r.data),
  unlike: (postId: string) =>
    api.delete<LikeResult>(`/posts/${postId}/like`).then((r) => r.data),
  getComments: (postId: string) =>
    api.get<Comment[]>(`/posts/${postId}/comments`).then((r) => r.data),
  addComment: (postId: string, content: string) =>
    api.post<Comment>(`/posts/${postId}/comments`, { content }).then((r) => r.data),
};
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/services/feed.service.ts src/shared/utils/date.ts src/shared/utils/date.test.ts
git commit --no-verify -m "feat(feed): tipos, service e timeAgo"
```

> Nota: o pre-commit hook (husky) está travando neste repo; use `--no-verify` e rode lint/tests manualmente nos steps. Investigar o hook é follow-up fora deste plano.

---

### Task 2: Feed store (Zustand) com otimismo

**Files:**
- Create: `src/features/feed/store.ts`
- Test: `src/features/feed/store.test.ts`

**Interfaces:**
- Consumes: `feedService`, tipos de `feed.service.ts`.
- Produces: `useFeedStore` com estado `{ posts, nextCursor, isLoadingInitial, isLoadingMore, isRefreshing, isCreating, commentsByPost, loadingCommentsByPost }` e ações `loadInitial`, `loadMore`, `refresh`, `createPost`, `toggleLike`, `loadComments`, `addComment`, `clear`.

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/store.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/feed/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Implement the store**

Create `src/features/feed/store.ts`:

```ts
import { Alert } from 'react-native';
import { create } from 'zustand';
import {
  feedService,
  Post,
  Comment,
  PostAchievement,
} from '@shared/services/feed.service';

interface FeedState {
  posts: Post[];
  nextCursor: string | null;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isCreating: boolean;
  commentsByPost: Record<string, Comment[]>;
  loadingCommentsByPost: Record<string, boolean>;

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
};

export const useFeedStore = create<FeedState>((set, get) => ({
  ...initialState,

  loadInitial: async () => {
    set({ isLoadingInitial: true });
    try {
      const page = await feedService.getFeed();
      set({ posts: page.posts, nextCursor: page.nextCursor, isLoadingInitial: false });
    } catch (e) {
      set({ isLoadingInitial: false });
      throw e;
    }
  },

  loadMore: async () => {
    const { nextCursor, isLoadingMore } = get();
    if (nextCursor === null || isLoadingMore) return;
    set({ isLoadingMore: true });
    try {
      const page = await feedService.getFeed(nextCursor);
      set((s) => ({
        posts: [...s.posts, ...page.posts],
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      }));
    } catch {
      set({ isLoadingMore: false });
    }
  },

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      const page = await feedService.getFeed();
      set({ posts: page.posts, nextCursor: page.nextCursor, isRefreshing: false });
    } catch {
      set({ isRefreshing: false });
    }
  },

  createPost: async (content, achievement) => {
    set({ isCreating: true });
    try {
      const created = await feedService.createPost({ content, achievement });
      set((s) => ({ posts: [created, ...s.posts], isCreating: false }));
      return created;
    } catch (e) {
      set({ isCreating: false });
      throw e;
    }
  },

  toggleLike: async (postId) => {
    const target = get().posts.find((p) => p.id === postId);
    if (!target) return;
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
      Alert.alert('Não foi possível curtir', 'Tente novamente.');
      throw e;
    }
  },

  loadComments: async (postId) => {
    set((s) => ({ loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: true } }));
    try {
      const comments = await feedService.getComments(postId);
      set((s) => ({
        commentsByPost: { ...s.commentsByPost, [postId]: comments },
        loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: false },
      }));
    } catch {
      set((s) => ({ loadingCommentsByPost: { ...s.loadingCommentsByPost, [postId]: false } }));
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
      Alert.alert('Não foi possível comentar', 'Tente novamente.');
      throw e;
    }
    void target; // contador já ajustado acima
  },

  clear: () => set({ ...initialState }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/feed/store.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/feed/store.ts src/features/feed/store.test.ts
git commit --no-verify -m "feat(feed): store zustand com otimismo de like e comentário"
```

---

### Task 3: `useFeed` hook

**Files:**
- Create: `src/features/feed/hooks/useFeed.ts`

**Interfaces:**
- Consumes: `useFeedStore`.
- Produces: `useFeed()` retornando `{ posts, isLoadingInitial, isLoadingMore, isRefreshing, loadInitial, loadMore, refresh, toggleLike, isEmpty, hasMore }`.

- [ ] **Step 1: Implement the hook** (sem teste dedicado — é só seletor; coberto pelos testes de store/screen)

Create `src/features/feed/hooks/useFeed.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/feed/hooks/useFeed.ts
git commit --no-verify -m "feat(feed): hook useFeed"
```

---

### Task 4: `AchievementCard` + `LikeButton`

**Files:**
- Create: `src/features/feed/components/AchievementCard.tsx`
- Create: `src/features/feed/components/LikeButton.tsx`
- Test: `src/features/feed/components/LikeButton.test.tsx`

**Interfaces:**
- Produces:
  - `AchievementCard({ achievement: PostAchievement })`
  - `LikeButton({ liked: boolean; count: number; onPress: () => void })`

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/components/LikeButton.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LikeButton } from './LikeButton';

describe('LikeButton', () => {
  it('mostra o contador e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <LikeButton liked={false} count={5} onPress={onPress} />,
    );
    expect(getByText('5')).toBeTruthy();
    fireEvent.press(getByTestId('like-button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renderiza coração preenchido quando liked', () => {
    const { getByTestId } = render(<LikeButton liked count={1} onPress={() => {}} />);
    expect(getByTestId('like-button').props.accessibilityState.selected).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/feed/components/LikeButton.test.tsx`
Expected: FAIL — cannot find module `./LikeButton`.

- [ ] **Step 3: Implement `LikeButton`**

Create `src/features/feed/components/LikeButton.tsx`:

```tsx
import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, typography } from '@theme';

interface Props {
  liked: boolean;
  count: number;
  onPress: () => void;
}

export function LikeButton({ liked, count, onPress }: Props): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }),
    ]).start();
    onPress();
  };

  return (
    <Pressable
      testID='like-button'
      onPress={handlePress}
      accessibilityRole='button'
      accessibilityState={{ selected: liked }}
      style={styles.row}
      hitSlop={8}
    >
      <Animated.Text style={[styles.heart, { color: liked ? colors.brandPrimary : colors.brandTextMuted, transform: [{ scale }] }]}>
        {liked ? '♥' : '♡'}
      </Animated.Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heart: { fontSize: 20 },
  count: { fontSize: 14, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/feed/components/LikeButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `AchievementCard`** (sem teste dedicado — display puro, coberto via PostCard)

Create `src/features/feed/components/AchievementCard.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import type { PostAchievement } from '@shared/services/feed.service';

export function AchievementCard({ achievement }: { achievement: PostAchievement }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{achievement.emoji}</Text>
      <View style={styles.texts}>
        <Text style={styles.title}>{achievement.title}</Text>
        <Text style={styles.subtitle}>{achievement.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.brandSupportSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  emoji: { fontSize: 26 },
  texts: { flex: 1 },
  title: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  subtitle: { fontSize: 13, color: colors.brandTextMuted, marginTop: 2 },
});
```

- [ ] **Step 6: Commit**

```bash
git add src/features/feed/components/LikeButton.tsx src/features/feed/components/LikeButton.test.tsx src/features/feed/components/AchievementCard.tsx
git commit --no-verify -m "feat(feed): LikeButton com animação e AchievementCard"
```

---

### Task 5: `PostCard` + `CommentRow` + skeleton + empty state

**Files:**
- Create: `src/features/feed/components/PostCard.tsx`
- Create: `src/features/feed/components/CommentRow.tsx`
- Create: `src/features/feed/components/PostCardSkeleton.tsx`
- Create: `src/features/feed/components/EmptyFeedState.tsx`
- Test: `src/features/feed/components/PostCard.test.tsx`

**Interfaces:**
- Consumes: `Post`, `Comment`, `Avatar`, `Card`, `LikeButton`, `AchievementCard`, `timeAgo`.
- Produces:
  - `PostCard({ post: Post; onPressComments: (postId: string) => void; onToggleLike: (postId: string) => void })`
  - `CommentRow({ comment: Comment })`
  - `PostCardSkeleton()`
  - `EmptyFeedState({ mode?: 'empty' | 'error'; onCreate?: () => void; onRetry?: () => void })`

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/components/PostCard.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PostCard } from './PostCard';
import type { Post } from '@shared/services/feed.service';

const basePost: Post = {
  id: 'p1',
  author: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  content: 'Bati minha meta hoje!',
  achievement: null,
  likeCount: 3,
  commentCount: 2,
  likedByMe: false,
  createdAt: new Date().toISOString(),
};

describe('PostCard', () => {
  it('renderiza autor, conteúdo e contador de comentários', () => {
    const { getByText } = render(
      <PostCard post={basePost} onPressComments={() => {}} onToggleLike={() => {}} />,
    );
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('Bati minha meta hoje!')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('renderiza AchievementCard quando há conquista', () => {
    const withAch: Post = {
      ...basePost,
      achievement: { type: 'streak', emoji: '🔥', title: 'Sequência de 7 dias', subtitle: '7 dias seguidos' },
    };
    const { getByText } = render(
      <PostCard post={withAch} onPressComments={() => {}} onToggleLike={() => {}} />,
    );
    expect(getByText('Sequência de 7 dias')).toBeTruthy();
  });

  it('aciona onPressComments e onToggleLike', () => {
    const onComments = jest.fn();
    const onLike = jest.fn();
    const { getByTestId } = render(
      <PostCard post={basePost} onPressComments={onComments} onToggleLike={onLike} />,
    );
    fireEvent.press(getByTestId('comments-button'));
    fireEvent.press(getByTestId('like-button'));
    expect(onComments).toHaveBeenCalledWith('p1');
    expect(onLike).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/feed/components/PostCard.test.tsx`
Expected: FAIL — cannot find module `./PostCard`.

- [ ] **Step 3: Implement `PostCard`**

Create `src/features/feed/components/PostCard.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Card } from '@shared/components/Card';
import { Avatar } from '@shared/components/Avatar';
import { timeAgo } from '@shared/utils/date';
import type { Post } from '@shared/services/feed.service';
import { LikeButton } from './LikeButton';
import { AchievementCard } from './AchievementCard';

interface Props {
  post: Post;
  onPressComments: (postId: string) => void;
  onToggleLike: (postId: string) => void;
}

export function PostCard({ post, onPressComments, onToggleLike }: Props): React.JSX.Element {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar size='sm' emoji={post.author.avatarEmoji ?? '🙂'} backgroundColor={colors.brandSupportSoft} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{post.author.name}</Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>
      {post.achievement ? <AchievementCard achievement={post.achievement} /> : null}

      <View style={styles.actions}>
        <LikeButton liked={post.likedByMe} count={post.likeCount} onPress={() => onToggleLike(post.id)} />
        <Pressable
          testID='comments-button'
          onPress={() => onPressComments(post.id)}
          style={styles.commentBtn}
          accessibilityRole='button'
          hitSlop={8}
        >
          <Text style={styles.commentIcon}>💬</Text>
          <Text style={styles.commentCount}>{post.commentCount}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  author: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted, marginTop: 1 },
  content: { fontSize: 15, color: colors.brandText, marginTop: 10, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentIcon: { fontSize: 16 },
  commentCount: { fontSize: 14, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/feed/components/PostCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `CommentRow`, `PostCardSkeleton`, `EmptyFeedState`**

Create `src/features/feed/components/CommentRow.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Avatar } from '@shared/components/Avatar';
import { timeAgo } from '@shared/utils/date';
import type { Comment } from '@shared/services/feed.service';

export function CommentRow({ comment }: { comment: Comment }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Avatar size='sm' emoji={comment.author.avatarEmoji ?? '🙂'} backgroundColor={colors.brandMutedSurface} />
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.author}>{comment.author.name}</Text>
          <Text style={styles.time}>{timeAgo(comment.createdAt)}</Text>
        </View>
        <Text style={styles.content}>{comment.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  body: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 14, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted },
  content: { fontSize: 14, color: colors.brandText, marginTop: 2, lineHeight: 20 },
});
```

Create `src/features/feed/components/PostCardSkeleton.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@theme';

export function PostCardSkeleton(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.72)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.72, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatar} />
        <View style={styles.titleBlock} />
      </View>
      <View style={styles.line} />
      <View style={styles.lineShort} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandTrack },
  titleBlock: { height: 14, width: 120, backgroundColor: colors.brandTrack, borderRadius: 999 },
  line: { height: 12, width: '92%', backgroundColor: colors.brandTrack, borderRadius: 999, marginBottom: 10 },
  lineShort: { height: 12, width: '60%', backgroundColor: colors.brandTrack, borderRadius: 999 },
});
```

Create `src/features/feed/components/EmptyFeedState.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';

interface Props {
  mode?: 'empty' | 'error';
  onCreate?: () => void;
  onRetry?: () => void;
}

export function EmptyFeedState({ mode = 'empty', onCreate, onRetry }: Props): React.JSX.Element {
  const isError = mode === 'error';
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{isError ? '😕' : '🌱'}</Text>
      <Text style={styles.title}>{isError ? 'Não foi possível carregar o feed' : 'Ainda não há posts'}</Text>
      <Text style={styles.subtitle}>
        {isError ? 'Verifique sua conexão e tente novamente.' : 'Seja o primeiro a compartilhar uma conquista!'}
      </Text>
      {isError ? (
        <Button onPress={onRetry ?? (() => {})}>Tentar de novo</Button>
      ) : (
        <Button onPress={onCreate ?? (() => {})}>Criar post</Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 8 },
  emoji: { fontSize: 44 },
  title: { fontSize: 17, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.brandTextMuted, textAlign: 'center', marginBottom: 8 },
});
```

> Verifique a assinatura real de `Button` em `src/shared/components/Button.tsx`. Se `children` não for aceito como label, use a prop correta (ex: `<Button>{...}</Button>` vs `title`). O design system documenta `children: string`.

- [ ] **Step 6: Run all feed component tests**

Run: `npx jest src/features/feed/components`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/feed/components
git commit --no-verify -m "feat(feed): PostCard, CommentRow, skeleton e empty state"
```

---

### Task 6: Telas — `FeedScreen`, `CreatePostScreen`, `PostCommentsScreen`

**Files:**
- Create: `src/features/feed/screens/FeedScreen.tsx`
- Create: `src/features/feed/screens/CreatePostScreen.tsx`
- Create: `src/features/feed/screens/PostCommentsScreen.tsx`
- Test: `src/features/feed/screens/FeedScreen.test.tsx`

**Interfaces:**
- Consumes: `useFeed`, `useFeedStore`, navegação `CommunityStackScreenProps` (definida na Task 7 — usar tipo `any` temporário NÃO; ordem: implemente Task 7 antes se preferir tipos estritos. Para manter TDD, estas telas importam os tipos de navegação que a Task 7 cria; rode `tsc` só ao final da Task 7).
- Produces: as três telas, exportadas como named exports.

> **Ordem recomendada:** faça a Task 7 (navegação/tipos) imediatamente após esta, e rode `tsc` no fim da Task 7. O teste de `FeedScreen` abaixo não depende de tipos de navegação (passa props mockadas).

- [ ] **Step 1: Write the failing test**

Create `src/features/feed/screens/FeedScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { FeedScreen } from './FeedScreen';
import { useFeedStore } from '../store';
import type { Post } from '@shared/services/feed.service';

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

const post: Post = {
  id: 'p1',
  author: { id: 'u1', name: 'Ana' },
  content: 'Primeiro post!',
  achievement: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  createdAt: new Date().toISOString(),
};

const navigation = { navigate: jest.fn() } as any;

describe('FeedScreen', () => {
  beforeEach(() => {
    useFeedStore.getState().clear();
    jest.clearAllMocks();
  });

  it('carrega e renderiza posts no mount', async () => {
    feedService.getFeed.mockResolvedValue({ posts: [post], nextCursor: null });
    const { getByText } = render(<FeedScreen navigation={navigation} route={{ key: 'k', name: 'Feed' }} />);
    await waitFor(() => expect(getByText('Primeiro post!')).toBeTruthy());
  });

  it('mostra empty state quando não há posts', async () => {
    feedService.getFeed.mockResolvedValue({ posts: [], nextCursor: null });
    const { getByText } = render(<FeedScreen navigation={navigation} route={{ key: 'k', name: 'Feed' }} />);
    await waitFor(() => expect(getByText('Ainda não há posts')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/features/feed/screens/FeedScreen.test.tsx`
Expected: FAIL — cannot find module `./FeedScreen`.

- [ ] **Step 3: Implement `FeedScreen`**

Create `src/features/feed/screens/FeedScreen.tsx`:

```tsx
import React, { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useFeed } from '../hooks/useFeed';
import { useFeedStore } from '../store';
import { PostCard } from '../components/PostCard';
import { PostCardSkeleton } from '../components/PostCardSkeleton';
import { EmptyFeedState } from '../components/EmptyFeedState';

interface Props {
  navigation: { navigate: (screen: string, params?: object) => void };
}

export function FeedScreen({ navigation }: Props): React.JSX.Element {
  const { posts, isLoadingInitial, isLoadingMore, isRefreshing, loadInitial, loadMore, refresh, toggleLike, isEmpty } = useFeed();
  const errored = useFeedStore((s) => s.posts.length === 0 && !s.isLoadingInitial);

  useEffect(() => {
    if (useFeedStore.getState().posts.length === 0) {
      loadInitial().catch(() => {});
    }
  }, [loadInitial]);

  const goCreate = () => navigation.navigate('CreatePost');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Comunidade</Text>
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
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={isEmpty ? <EmptyFeedState mode='empty' onCreate={goCreate} /> : null}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.brandPrimary} style={styles.footer} /> : null}
        />
      )}

      <Pressable style={styles.fab} onPress={goCreate} accessibilityRole='button' accessibilityLabel='Criar post'>
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>
      {void errored}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 24, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  listContent: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  footer: { paddingVertical: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
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
```

> Remova o `{void errored}` e a const `errored` se o lint reclamar — eles são só salvaguarda; o empty/erro real do feed usa `ListEmptyComponent`. Para modo erro explícito, capture falha de `loadInitial` num `useState` local e renderize `EmptyFeedState mode='error'`. (Mantido simples aqui; refine se desejar.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/features/feed/screens/FeedScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `CreatePostScreen`**

Create `src/features/feed/screens/CreatePostScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { useFeedStore } from '../store';
import type { AchievementType, PostAchievement } from '@shared/services/feed.service';

interface Props {
  navigation: { goBack: () => void };
}

const ACHIEVEMENT_OPTIONS: PostAchievement[] = [
  { type: 'diet_completed' as AchievementType, emoji: '🍽️', title: 'Dieta concluída', subtitle: 'Completei todas as refeições de hoje' },
  { type: 'meal_logged' as AchievementType, emoji: '🥗', title: 'Refeição registrada', subtitle: 'Registrei minha refeição no diário' },
  { type: 'streak' as AchievementType, emoji: '🔥', title: 'Sequência ativa', subtitle: 'Mantive minha sequência de dias' },
];

export function CreatePostScreen({ navigation }: Props): React.JSX.Element {
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState<PostAchievement | null>(null);
  const isCreating = useFeedStore((s) => s.isCreating);
  const createPost = useFeedStore((s) => s.createPost);

  const canSubmit = content.trim().length > 0 && !isCreating;

  const submit = async () => {
    try {
      await createPost(content.trim(), selected ?? undefined);
      navigation.goBack();
    } catch {
      /* Alert já disparado no store em falhas de rede futuras; createPost relança */
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          style={styles.input}
          placeholder='Compartilhe sua conquista...'
          placeholderTextColor={colors.brandTextMuted}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
        />

        <Text style={styles.label}>Anexar conquista (opcional)</Text>
        {ACHIEVEMENT_OPTIONS.map((opt) => {
          const active = selected?.type === opt.type;
          return (
            <Pressable
              key={opt.type}
              onPress={() => setSelected(active ? null : opt)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <View style={styles.optionTexts}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button onPress={submit} disabled={!canSubmit} loading={isCreating}>
          Publicar
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 20, gap: 16 },
  input: {
    minHeight: 120,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 14,
    fontSize: 16,
    color: colors.brandText,
    textAlignVertical: 'top',
  },
  label: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brandDivider,
    padding: 12,
  },
  optionActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSupportSoft },
  optionEmoji: { fontSize: 24 },
  optionTexts: { flex: 1 },
  optionTitle: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  optionSubtitle: { fontSize: 13, color: colors.brandTextMuted, marginTop: 2 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
```

- [ ] **Step 6: Implement `PostCommentsScreen`**

Create `src/features/feed/screens/PostCommentsScreen.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useFeedStore } from '../store';
import { CommentRow } from '../components/CommentRow';

interface Props {
  route: { params: { postId: string } };
}

export function PostCommentsScreen({ route }: Props): React.JSX.Element {
  const { postId } = route.params;
  const comments = useFeedStore((s) => s.commentsByPost[postId] ?? []);
  const isLoading = useFeedStore((s) => s.loadingCommentsByPost[postId] ?? false);
  const loadComments = useFeedStore((s) => s.loadComments);
  const addComment = useFeedStore((s) => s.addComment);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    loadComments(postId);
  }, [loadComments, postId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    addComment(postId, text).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isLoading && comments.length === 0 ? (
          <ActivityIndicator color={colors.brandPrimary} style={styles.loader} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <CommentRow comment={item} />}
            ListEmptyComponent={<Text style={styles.empty}>Seja o primeiro a comentar.</Text>}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder='Escreva um comentário...'
            placeholderTextColor={colors.brandTextMuted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType='send'
          />
          <Pressable onPress={send} style={styles.sendBtn} accessibilityRole='button' accessibilityLabel='Enviar'>
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  flex: { flex: 1 },
  loader: { marginTop: 32 },
  list: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: 32, fontSize: 14 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.brandDivider },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.brandText,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: colors.white, fontSize: 16 },
});
```

- [ ] **Step 7: Run the feed screen test**

Run: `npx jest src/features/feed/screens/FeedScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/feed/screens
git commit --no-verify -m "feat(feed): FeedScreen, CreatePostScreen e PostCommentsScreen"
```

---

### Task 7: Navegação — `CommunityNavigator`, tipos, 6ª aba e deep link

**Files:**
- Create: `src/navigation/CommunityNavigator.tsx`
- Modify: `src/navigation/types.ts` (add `CommunityStackParamList` + `Community` no `TabParamList` + helper)
- Modify: `src/navigation/BrandTabNavigator.tsx` (add aba Comunidade + ícone)
- Modify: `src/navigation/RootNavigator.tsx` (add `linking` no `NavigationContainer`)

**Interfaces:**
- Consumes: `FeedScreen`, `CreatePostScreen`, `PostCommentsScreen`.
- Produces: `CommunityNavigator`; tipo `CommunityStackParamList`; rota `Community` em `TabParamList`.

- [ ] **Step 1: Extend navigation types**

In `src/navigation/types.ts`, add after `TabParamList` and update it:

```ts
import type { NavigatorScreenParams } from '@react-navigation/native';

export type CommunityStackParamList = {
  Feed: undefined;
  CreatePost: undefined;
  PostComments: { postId: string };
  // Challenges screens são adicionadas no Plano 2; Notifications no Plano 3.
};
```

Update `TabParamList` to include:

```ts
export type TabParamList = {
  Dashboard: undefined;
  FoodLog: undefined;
  Scanner: undefined;
  Coach: undefined;
  Profile: undefined;
  Community: NavigatorScreenParams<CommunityStackParamList>;
};
```

Add helper at the bottom:

```ts
export type CommunityStackScreenProps<T extends keyof CommunityStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<CommunityStackParamList, T>,
    TabScreenProps<'Community'>
  >;
```

- [ ] **Step 2: Create `CommunityNavigator`**

Create `src/navigation/CommunityNavigator.tsx`:

```tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedScreen } from '@features/feed/screens/FeedScreen';
import { CreatePostScreen } from '@features/feed/screens/CreatePostScreen';
import { PostCommentsScreen } from '@features/feed/screens/PostCommentsScreen';
import { colors } from '@theme';
import type { CommunityStackParamList } from './types';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export function CommunityNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandBackground },
        headerTintColor: colors.brandAnchor,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name='Feed' component={FeedScreen} options={{ headerShown: false }} />
      <Stack.Screen name='CreatePost' component={CreatePostScreen} options={{ presentation: 'modal', title: 'Novo post' }} />
      <Stack.Screen name='PostComments' component={PostCommentsScreen} options={{ title: 'Comentários' }} />
    </Stack.Navigator>
  );
}
```

- [ ] **Step 3: Add the Community tab to `BrandTabNavigator`**

In `src/navigation/BrandTabNavigator.tsx`:

Import the navigator:
```tsx
import { CommunityNavigator } from './CommunityNavigator';
```

Add a `Community` branch inside `TabIcon` (before the final profile `return`), a simple two-people glyph:
```tsx
  if (routeName === 'Community') {
    return (
      <View style={styles.iconFrame}>
        <View style={styles.communityRow}>
          <View style={[styles.communityHead, { borderColor: tint }]} />
          <View style={[styles.communityHead, { borderColor: tint, marginLeft: -3 }]} />
        </View>
        <View style={[styles.communityBody, { borderColor: tint }]} />
      </View>
    );
  }
```

Add the styles to the `StyleSheet.create`:
```tsx
  communityRow: { flexDirection: 'row' },
  communityHead: { width: 6, height: 6, borderRadius: 999, borderWidth: 1.4 },
  communityBody: { width: 16, height: 7, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1.4, borderBottomWidth: 0, marginTop: 1.5 },
```

Add the screen inside `<Tab.Navigator>` (after Coach, before Profile):
```tsx
      <Tab.Screen name='Community' component={CommunityNavigator} options={{ title: 'Comunidade' }} />
```

> Atenção: o `BrandTabNavigator.tsx` foi modificado em paralelo no working tree. Reconcilie estas mudanças com o estado atual do arquivo antes de aplicar.

- [ ] **Step 4: Add deep linking in `RootNavigator`**

In `src/navigation/RootNavigator.tsx`, add a `linking` const and pass it to `NavigationContainer`:

```tsx
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['caloria://', 'https://caloria.app'],
  config: {
    screens: {
      App: {
        screens: {
          Community: {
            screens: {
              // Plano 2 adiciona: ChallengeLeaderboard: 'challenge/:challengeId'
              PostComments: 'post/:postId',
            },
          },
        },
      },
    },
  },
};
```

Then: `<NavigationContainer linking={linking}>`.

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. (Resolve quaisquer mismatches de tipos das telas da Task 6 agora.)

- [ ] **Step 6: Run the full feed test suite**

Run: `npx jest src/features/feed`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/navigation
git commit --no-verify -m "feat(community): aba Comunidade, CommunityNavigator e deep linking do feed"
```

---

### Task 8: Handlers MSW do feed + registro + logout

**Files:**
- Create: `mocks/handlers/feed.ts`
- Modify: `mocks/server.ts` (registrar `feedHandlers`)
- Modify: `src/features/auth/store.ts` (`clearToken` chama `useFeedStore.getState().clear()`)

**Interfaces:**
- Consumes: contrato da seção 5.1 da spec.
- Produces: `feedHandlers` (array MSW).

- [ ] **Step 1: Create the MSW handlers**

Create `mocks/handlers/feed.ts`:

```ts
import { http, HttpResponse } from 'msw';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}
interface Comment {
  id: string;
  postId: string;
  author: PostAuthor;
  content: string;
  createdAt: string;
}
interface Post {
  id: string;
  author: PostAuthor;
  content: string;
  achievement: { type: string; emoji: string; title: string; subtitle: string } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
}

const me: PostAuthor = { id: 'me', name: 'Você', avatarEmoji: '😎' };
const ana: PostAuthor = { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' };
const bruno: PostAuthor = { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' };

let posts: Post[] = [
  {
    id: 'p1',
    author: ana,
    content: 'Fechei a dieta de hoje certinho! 💪',
    achievement: { type: 'diet_completed', emoji: '🍽️', title: 'Dieta concluída', subtitle: '4 de 4 refeições · 1.850 kcal' },
    likeCount: 12,
    commentCount: 1,
    likedByMe: false,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'p2',
    author: bruno,
    content: '7 dias seguidos registrando tudo. Bora!',
    achievement: { type: 'streak', emoji: '🔥', title: 'Sequência de 7 dias', subtitle: '7 dias seguidos' },
    likeCount: 5,
    commentCount: 0,
    likedByMe: true,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
];

const commentsByPost: Record<string, Comment[]> = {
  p1: [{ id: 'c1', postId: 'p1', author: bruno, content: 'Mandou bem! 👏', createdAt: new Date(Date.now() - 1800_000).toISOString() }],
};

let seq = 100;
const nextId = (prefix: string) => `${prefix}-${seq++}`;

export const feedHandlers = [
  http.get('*/feed', ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Number(url.searchParams.get('limit') ?? '10');
    const start = cursor ? Number(cursor) : 0;
    const slice = posts.slice(start, start + limit);
    const nextStart = start + limit;
    return HttpResponse.json({
      posts: slice,
      nextCursor: nextStart < posts.length ? String(nextStart) : null,
    });
  }),

  http.post('*/posts', async ({ request }) => {
    const body = (await request.json()) as { content: string; achievement?: Post['achievement'] };
    const created: Post = {
      id: nextId('p'),
      author: me,
      content: body.content,
      achievement: body.achievement ?? null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
    };
    posts = [created, ...posts];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/posts/:id/like', ({ params }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) return new HttpResponse(null, { status: 404 });
    post.likedByMe = true;
    post.likeCount += 1;
    return HttpResponse.json({ likeCount: post.likeCount, likedByMe: true });
  }),

  http.delete('*/posts/:id/like', ({ params }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) return new HttpResponse(null, { status: 404 });
    post.likedByMe = false;
    post.likeCount = Math.max(0, post.likeCount - 1);
    return HttpResponse.json({ likeCount: post.likeCount, likedByMe: false });
  }),

  http.get('*/posts/:id/comments', ({ params }) => {
    return HttpResponse.json(commentsByPost[params.id as string] ?? []);
  }),

  http.post('*/posts/:id/comments', async ({ params, request }) => {
    const postId = params.id as string;
    const body = (await request.json()) as { content: string };
    const comment: Comment = {
      id: nextId('c'),
      postId,
      author: me,
      content: body.content,
      createdAt: new Date().toISOString(),
    };
    commentsByPost[postId] = [...(commentsByPost[postId] ?? []), comment];
    const post = posts.find((p) => p.id === postId);
    if (post) post.commentCount += 1;
    return HttpResponse.json(comment, { status: 201 });
  }),
];
```

- [ ] **Step 2: Register handlers in `mocks/server.ts`**

Add import and spread:
```ts
import { feedHandlers } from './handlers/feed';
```
```ts
export const server = setupServer(
  ...authHandlers,
  ...foodLogHandlers,
  ...scannerHandlers,
  ...coachHandlers,
  ...dietHandlers,
  ...feedHandlers,
);
```

- [ ] **Step 3: Clear feed store on logout**

In `src/features/auth/store.ts`:

Add import:
```ts
import { useFeedStore } from '@features/feed/store';
```

In `clearToken`, add before/after the existing clears:
```ts
    useFeedStore.getState().clear();
```

- [ ] **Step 4: Type-check + full test run**

Run: `npx tsc --noEmit && npx jest src/features/feed src/features/auth`
Expected: no type errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mocks/handlers/feed.ts mocks/server.ts src/features/auth/store.ts
git commit --no-verify -m "feat(feed): handlers MSW e limpeza no logout"
```

---

### Task 9: Smoke manual + fechamento do Plano 1

- [ ] **Step 1: Rodar o app (web) e validar o fluxo**

Run: `npm run web`
Validar manualmente:
1. Aba "Comunidade" aparece na tab bar.
2. Feed carrega 2 posts mockados; pull-to-refresh funciona.
3. Curtir um post: coração faz pop e contador muda.
4. FAB "＋" abre "Novo post"; publicar com texto volta ao feed com o post no topo.
5. Tocar no ícone de comentário abre a tela; enviar comentário aparece na lista e incrementa contador.

- [ ] **Step 2: Suite completa**

Run: `npx jest && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 3: Commit final (se houver ajustes do smoke)**

```bash
git add -A
git commit --no-verify -m "test(feed): ajustes do smoke manual do feed"
```

---

## Self-Review (cobertura vs spec)

- Feed scroll infinito (D17–D20): Task 2 (`loadMore`/cursor), Task 6 (`FeedScreen` `onEndReached`), Task 8 (paginação MSW). ✅
- Post card texto + conquista + likes + comentários (D20–D21): Tasks 4, 5. ✅
- Criar post (D21–D22): Task 6 (`CreatePostScreen` + `AchievementPicker` inline). ✅
- Like animado + abrir comentários (D22–D23): Task 4 (`LikeButton` Animated), Task 6 (`PostCommentsScreen`). ✅
- Identidade visual VITAL LIGHT: todos os componentes usam tokens de `@theme`. ✅
- Navegação nova aba + deep link parcial: Task 7. ✅
- Mocks + logout: Task 8. ✅
- **Fora deste plano (Planos 2 e 3):** Desafios/ranking, Notificações. Telas de challenge no `CommunityNavigator` e a rota de deep link `challenge/:challengeId` são adicionadas no Plano 2; sino/badge no header do Feed no Plano 3.
