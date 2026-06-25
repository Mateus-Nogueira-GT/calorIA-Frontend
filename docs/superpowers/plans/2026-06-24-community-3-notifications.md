# Comunidade — Plano 3: Notificações in-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificações in-app — sino com badge de não-lidas no header do Feed, tela de notificações com "marcar todas como lidas", navegação ao tocar, e atualização por polling (~45s + ao focar o app).

**Architecture:** Nova feature `src/features/notifications` (service → store Zustand → componentes → tela), com sino integrado ao header do `FeedScreen` e a tela registrada no `CommunityNavigator`. Polling via hook `useNotificationPolling` (`setInterval` + `AppState`) montado no `CommunityNavigator`. Backend mockado via MSW.

**Tech Stack:** React Native 0.76, TypeScript, Zustand, axios, React Navigation, `AppState`, MSW, Jest + @testing-library/react-native.

**Pré-requisito:** Planos 1 e 2 concluídos — `CommunityNavigator`, `CommunityStackParamList`, `FeedScreen` header e `feed.service.ts` (`PostAuthor`) já existem.

## Global Constraints

- **Cores:** só tokens de `src/theme/colors.ts`. Ponto/badge de não-lida em `brandPrimary`; fundo de item não-lido em `brandMutedSurface`; nomes em `brandAnchor`.
- **Stores/services/testes:** mesmos padrões dos Planos 1 e 2. Store tests com `@jest/globals` + `jest.mock` + `renderHook`/`act`.
- **`PostAuthor`** reimportado de `@shared/services/feed.service` (com `import type`).
- **Polling:** intervalo 45s; só roda autenticado e com app em foreground; para no unmount/logout.
- **Idioma:** copy em PT-BR.
- **Gate:** `npx jest <path>` (não rodar `tsc` completo; há falhas `@env` pré-existentes não relacionadas). Saída de teste pristine.
- **Telas/props:** usar `CommunityStackScreenProps<...>`.

---

### Task 1: Tipos e service de notificações

**Files:**
- Create: `src/shared/services/notifications.service.ts`

**Interfaces:**
- Consumes: `PostAuthor` de `@shared/services/feed.service`.
- Produces: tipos `NotificationType`, `AppNotification`, `NotificationsResponse`; `notificationsService` com `getNotifications`, `markRead`.

- [ ] **Step 1: Create the service** — `src/shared/services/notifications.service.ts`:

```ts
import api from './api';
import type { PostAuthor } from './feed.service';

export type NotificationType = 'like' | 'comment' | 'challenge_invite' | 'challenge_rank';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: PostAuthor;
  message: string;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
}

export const notificationsService = {
  getNotifications: () =>
    api.get<NotificationsResponse>('/notifications').then((r) => r.data),
  markRead: (ids?: string[]) =>
    api.post<{ unreadCount: number }>('/notifications/read', { ids }).then((r) => r.data),
};
```

---

### Task 2: Notifications store (Zustand)

**Files:**
- Create: `src/features/notifications/store.ts`
- Test: `src/features/notifications/store.test.ts`

**Interfaces:**
- Produces: `useNotificationsStore` com `{ items, unreadCount, isLoading }` e ações `load`, `markAllRead`, `markRead`, `clear`.

- [ ] **Step 1: Write the failing test** — `src/features/notifications/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNotificationsStore } from './store';
import type { AppNotification } from '@shared/services/notifications.service';

const notif = (id: string, read = false): AppNotification => ({
  id,
  type: 'like',
  actor: { id: 'u1', name: 'Ana' },
  message: 'curtiu seu post',
  targetId: 'p1',
  read,
  createdAt: '2026-06-24T10:00:00Z',
});

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: {
    getNotifications: jest.fn(),
    markRead: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ items: [], unreadCount: 0, isLoading: false });
    jest.clearAllMocks();
  });

  it('load popula items e unreadCount', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items: [notif('n1'), notif('n2', true)], unreadCount: 1 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.load());
    expect(result.current.items).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAllRead otimista zera unreadCount e marca todos lidos', async () => {
    useNotificationsStore.setState({ items: [notif('n1'), notif('n2')], unreadCount: 2 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 0 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items.every((n) => n.read)).toBe(true);
  });

  it('markRead marca um item e decrementa unreadCount', async () => {
    useNotificationsStore.setState({ items: [notif('n1'), notif('n2')], unreadCount: 2 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 1 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markRead('n1'));
    expect(result.current.items.find((n) => n.id === 'n1')?.read).toBe(true);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markRead é no-op se item já está lido', async () => {
    useNotificationsStore.setState({ items: [notif('n1', true)], unreadCount: 0 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markRead('n1'));
    expect(notificationsService.markRead).not.toHaveBeenCalled();
  });

  it('clear zera o estado', () => {
    useNotificationsStore.setState({ items: [notif('n1')], unreadCount: 1 });
    useNotificationsStore.getState().clear();
    expect(useNotificationsStore.getState().items).toEqual([]);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement the store** — `src/features/notifications/store.ts`:

```ts
import { create } from 'zustand';
import { notificationsService } from '@shared/services/notifications.service';
import type { AppNotification } from '@shared/services/notifications.service';

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
  isLoading: boolean;

  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  clear: () => void;
}

const initialState = {
  items: [] as AppNotification[],
  unreadCount: 0,
  isLoading: false,
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const res = await notificationsService.getNotifications();
      set({ items: res.items, unreadCount: res.unreadCount, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  markAllRead: async () => {
    const snapshot = { items: get().items, unreadCount: get().unreadCount };
    if (snapshot.unreadCount === 0) return;
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    try {
      await notificationsService.markRead();
    } catch {
      set(snapshot);
    }
  },

  markRead: async (id) => {
    const target = get().items.find((n) => n.id === id);
    if (!target || target.read) return;
    const snapshot = { items: get().items, unreadCount: get().unreadCount };
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    try {
      await notificationsService.markRead([id]);
    } catch {
      set(snapshot);
    }
  },

  clear: () => set({ ...initialState }),
}));
```

- [ ] **Step 4: Run → GREEN** (5 testes)

---

### Task 3: `useNotificationPolling` hook

**Files:**
- Create: `src/features/notifications/hooks/useNotificationPolling.ts`
- Test: `src/features/notifications/hooks/useNotificationPolling.test.ts`

**Interfaces:** `useNotificationPolling()` — busca ao montar (se autenticado), a cada 45s, e ao app voltar a `active`; para no unmount.

- [ ] **Step 1: Write the failing test** — `src/features/notifications/hooks/useNotificationPolling.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useNotificationPolling } from './useNotificationPolling';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: { getNotifications: jest.fn(), markRead: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

describe('useNotificationPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    notificationsService.getNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    useAuthStore.setState({ isAuthenticated: true } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('busca imediatamente ao montar quando autenticado', () => {
    renderHook(() => useNotificationPolling());
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(1);
  });

  it('busca de novo após o intervalo', () => {
    renderHook(() => useNotificationPolling());
    jest.advanceTimersByTime(45_000);
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('não busca quando não autenticado', () => {
    useAuthStore.setState({ isAuthenticated: false } as never);
    renderHook(() => useNotificationPolling());
    expect(notificationsService.getNotifications).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement the hook** — `src/features/notifications/hooks/useNotificationPolling.ts`:

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNotificationsStore } from '../store';
import { useAuthStore } from '@features/auth/store';

const POLL_INTERVAL_MS = 45_000;

export function useNotificationPolling(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchNow = () => {
      void useNotificationsStore.getState().load();
    };

    fetchNow();
    const interval = setInterval(fetchNow, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchNow();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isAuthenticated]);
}
```

- [ ] **Step 4: Run → GREEN**

> Se o teste falhar por causa do ponto de espionagem (o hook chama `useNotificationsStore.getState().load()` que internamente chama o service), o mock do service (`notificationsService.getNotifications`) é o ponto de asserção correto — como já está no teste acima.

---

### Task 4: Componentes — `NotificationBell` + `NotificationRow`

**Files:**
- Create: `src/features/notifications/components/NotificationBell.tsx`
- Create: `src/features/notifications/components/NotificationRow.tsx`
- Test: `src/features/notifications/components/NotificationBell.test.tsx`
- Test: `src/features/notifications/components/NotificationRow.test.tsx`

**Interfaces:** `NotificationBell({ count, onPress })`; `NotificationRow({ notification, onPress })`.

- [ ] **Step 1: Write failing tests**

`src/features/notifications/components/NotificationBell.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NotificationBell } from './NotificationBell';

describe('NotificationBell', () => {
  it('mostra o badge com a contagem quando > 0', () => {
    const { getByText } = render(<NotificationBell count={3} onPress={() => {}} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('não mostra badge quando count é 0', () => {
    const { queryByText } = render(<NotificationBell count={0} onPress={() => {}} />);
    expect(queryByText('0')).toBeNull();
  });

  it('dispara onPress', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<NotificationBell count={1} onPress={onPress} />);
    fireEvent.press(getByTestId('notification-bell'));
    expect(onPress).toHaveBeenCalled();
  });
});
```

`src/features/notifications/components/NotificationRow.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NotificationRow } from './NotificationRow';
import type { AppNotification } from '@shared/services/notifications.service';

const notif = (read: boolean): AppNotification => ({
  id: 'n1',
  type: 'like',
  actor: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  message: 'curtiu seu post',
  targetId: 'p1',
  read,
  createdAt: new Date().toISOString(),
});

describe('NotificationRow', () => {
  it('mostra ator + mensagem e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<NotificationRow notification={notif(false)} onPress={onPress} />);
    expect(getByText(/Ana/)).toBeTruthy();
    expect(getByText(/curtiu seu post/)).toBeTruthy();
    fireEvent.press(getByTestId('notification-row'));
    expect(onPress).toHaveBeenCalled();
  });

  it('sinaliza não-lida via accessibilityState', () => {
    const { getByTestId } = render(<NotificationRow notification={notif(false)} onPress={() => {}} />);
    expect(getByTestId('notification-row').props.accessibilityState.selected).toBe(true);
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement `NotificationBell`** — `src/features/notifications/components/NotificationBell.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';

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
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 10, fontFamily: typography.fontFamily.bold },
});
```

- [ ] **Step 4: Implement `NotificationRow`** — `src/features/notifications/components/NotificationRow.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowUnread: { backgroundColor: colors.brandMutedSurface },
  body: { flex: 1 },
  text: { fontSize: 14, color: colors.brandText, lineHeight: 20 },
  actor: { color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
});
```

- [ ] **Step 5: Run `npx jest src/features/notifications/components` → GREEN**

---

### Task 5: `NotificationsScreen`

**Files:**
- Create: `src/features/notifications/screens/NotificationsScreen.tsx`
- Test: `src/features/notifications/screens/NotificationsScreen.test.tsx`

**Interfaces:** `NotificationsScreen({ navigation })` — lista + "marcar todas como lidas" + navegação por `type`/`targetId`.

- [ ] **Step 1: Write the failing test** — `src/features/notifications/screens/NotificationsScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { NotificationsScreen } from './NotificationsScreen';
import { useNotificationsStore } from '../store';
import type { AppNotification } from '@shared/services/notifications.service';

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: { getNotifications: jest.fn(), markRead: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

const items: AppNotification[] = [
  { id: 'n1', type: 'like', actor: { id: 'u1', name: 'Ana' }, message: 'curtiu seu post', targetId: 'p1', read: false, createdAt: new Date().toISOString() },
];
const navigation = { navigate: jest.fn() } as never;

describe('NotificationsScreen', () => {
  beforeEach(() => {
    useNotificationsStore.getState().clear();
    jest.clearAllMocks();
  });

  it('carrega e lista notificações', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items, unreadCount: 1 });
    const { getByText } = render(<NotificationsScreen navigation={navigation} route={{ key: 'k', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByText(/curtiu seu post/)).toBeTruthy());
  });

  it('botão marca todas como lidas', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items, unreadCount: 1 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 0 });
    const { getByText } = render(<NotificationsScreen navigation={navigation} route={{ key: 'k', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByText(/curtiu seu post/)).toBeTruthy());
    fireEvent.press(getByText('Marcar todas como lidas'));
    await waitFor(() => expect(notificationsService.markRead).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement `NotificationsScreen`** — `src/features/notifications/screens/NotificationsScreen.tsx`:

```tsx
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
```

- [ ] **Step 4: Run → GREEN**

---

### Task 6: Integrar na navegação, sino no Feed e polling

**Files:**
- Modify: `src/navigation/types.ts` (add `Notifications` ao `CommunityStackParamList`)
- Modify: `src/navigation/CommunityNavigator.tsx` (registrar `NotificationsScreen` + montar `useNotificationPolling`)
- Modify: `src/features/feed/screens/FeedScreen.tsx` (`NotificationBell` no header)

- [ ] **Step 1:** `CommunityStackParamList` ganha `Notifications: undefined;`.
- [ ] **Step 2:** `CommunityNavigator`: importar `NotificationsScreen` + `useNotificationPolling`; chamar `useNotificationPolling()` no topo do componente; registrar `<Stack.Screen name='Notifications' component={NotificationsScreen} options={{ title: 'Notificações' }} />`.
- [ ] **Step 3:** `FeedScreen`: importar `NotificationBell` + `useNotificationsStore`; ler `const unreadCount = useNotificationsStore((s) => s.unreadCount);` e adicionar o sino à direita do header (ao lado do 🏆), com `onPress={() => navigation.navigate('Notifications')}`. Agrupar os botões num `headerActions` (flexDirection row, gap).
- [ ] **Step 4:** `npx jest src/features/feed src/features/notifications` → GREEN, pristine.

---

### Task 7: Handlers MSW de notificações + registro + logout

**Files:**
- Create: `mocks/handlers/notifications.ts`
- Modify: `mocks/server.ts` (registrar `notificationsHandlers`)
- Modify: `src/features/auth/store.ts` (`clearToken` chama `useNotificationsStore.getState().clear()`)

- [ ] **Step 1: Create the MSW handlers** — `mocks/handlers/notifications.ts`:

```ts
import { http, HttpResponse } from 'msw';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}
interface AppNotification {
  id: string;
  type: 'like' | 'comment' | 'challenge_invite' | 'challenge_rank';
  actor: PostAuthor;
  message: string;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

const ana: PostAuthor = { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' };
const bruno: PostAuthor = { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' };

let items: AppNotification[] = [
  { id: 'n1', type: 'like', actor: ana, message: 'curtiu seu post', targetId: 'p1', read: false, createdAt: new Date(Date.now() - 600_000).toISOString() },
  { id: 'n2', type: 'comment', actor: bruno, message: 'comentou no seu post', targetId: 'p1', read: false, createdAt: new Date(Date.now() - 5_400_000).toISOString() },
  { id: 'n3', type: 'challenge_rank', actor: ana, message: 'passou você no ranking', targetId: 'ch1', read: true, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const unread = () => items.filter((n) => !n.read).length;

export const notificationsHandlers = [
  http.get('*/notifications', () => HttpResponse.json({ items, unreadCount: unread() })),

  http.post('*/notifications/read', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    if (body.ids && body.ids.length > 0) {
      items = items.map((n) => (body.ids!.includes(n.id) ? { ...n, read: true } : n));
    } else {
      items = items.map((n) => ({ ...n, read: true }));
    }
    return HttpResponse.json({ unreadCount: unread() });
  }),
];
```

- [ ] **Step 2:** Registrar em `mocks/server.ts` (`import { notificationsHandlers }` + `...notificationsHandlers,`).
- [ ] **Step 3:** Logout — em `src/features/auth/store.ts`: `import { useNotificationsStore } from '@features/notifications/store';` e `useNotificationsStore.getState().clear();` em `clearToken`.
- [ ] **Step 4:** `npx jest src/features/notifications src/features/auth` → notifications GREEN (falhas `@env` em auth são pré-existentes).

---

### Task 8: Fechamento do módulo Comunidade

- [ ] **Step 1:** `npx jest src/features/notifications src/features/feed src/features/challenges` → tudo verde, pristine.
- [ ] **Step 2:** Smoke (web) — `npm run web`: sino no header com badge "2"; abrir Notificações (2 não-lidas destacadas); "marcar todas como lidas" zera badge; tocar like/comment → comentários; tocar ranking → leaderboard; logout zera estado.
- [ ] **Step 3:** Commit final do Plano 3 (controlador).

## Self-Review (cobertura vs spec)

- Notificações in-app: store (Task 2), tela (Task 5), componentes (Task 4). ✅
- Badge de não-lidas no header: Task 4 (`NotificationBell`), Task 6. ✅
- Polling (~45s + foco): Task 3 (`useNotificationPolling`), Task 6 (montagem no `CommunityNavigator`). ✅
- Navegação ao tocar (post/desafio): Task 5 (`targetFor`). ✅
- Identidade VITAL LIGHT: tokens; ponto/badge `brandPrimary`, item não-lido `brandMutedSurface`. ✅
- Logout limpa store: Task 7. ✅
- Out of scope: push real (FCM/APNs); realtime (WebSocket/SSE).

## Fechamento do módulo (após os 3 planos)
Com Planos 1–3 concluídos, todos os itens D17–D26 da checklist de Frontend estão entregues. Follow-ups conhecidos: corrigir config jest do `@env` (suítes pré-existentes); seletor de datas no `CreateChallengeScreen`; upload de imagem em posts; push notifications reais.
