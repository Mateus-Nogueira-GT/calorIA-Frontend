# Comunidade — Plano 2: Desafios + Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listar desafios ativos, criar desafio, convidar amigos via link (Share + deep link) e exibir o ranking/leaderboard por streak.

**Architecture:** Nova feature `src/features/challenges` (service → store Zustand → componentes → telas), com as telas adicionadas ao `CommunityNavigator` já criado no Plano 1. Convite via `Share` API nativo + deep link `caloria://challenge/:code` resolvido por `GET /challenges/invite/:code`. Backend mockado via MSW.

**Tech Stack:** React Native 0.76, TypeScript, Zustand, axios, React Navigation, `Share` API, MSW, Jest + @testing-library/react-native.

**Pré-requisito:** Plano 1 (Fundação + Feed) concluído — `CommunityNavigator`, `CommunityStackParamList`, aba Comunidade e `feed.service.ts` (fonte de `PostAuthor`) já existem.

## Global Constraints

- **Cores:** só tokens de `src/theme/colors.ts`. Ranking/posição top-3 e badge de streak em `brandSupport`/`brandSupportSoft`; CTAs em `brandPrimary`; nomes/headers em `brandAnchor`; linha do próprio usuário (`isMe`) com fundo `brandSupportSoft`.
- **Stores/services/testes:** mesmos padrões do Plano 1 (espelhar `src/features/feed` e `src/features/diet`). Store tests com `jest.mock` do service, `renderHook`+`act`, reset via `setState` em `beforeEach`, globais de `@jest/globals`.
- **`PostAuthor`** é reimportado de `@shared/services/feed.service` — não redefinir.
- **Idioma:** copy em PT-BR.
- **Datas:** usar `dateToString`/`formatChipLabel` de `@shared/utils/date` quando aplicável.
- **Testes com animação** (se houver): drenar timers dentro de `act` (`jest.useFakeTimers()` + `jest.runAllTimers()`) para saída pristine.
- **Gate:** `npx jest <path>` (não rodar `tsc` completo). Telas usam `CommunityStackScreenProps<...>`.

---

### Task 1: Tipos e service de desafios

**Files:**
- Create: `src/shared/services/challenges.service.ts`

**Interfaces:**
- Consumes: `PostAuthor` de `@shared/services/feed.service`.
- Produces: tipos `ChallengeMetric`, `Challenge`, `LeaderboardEntry`, `CreateChallengeInput`; `challengesService` com `getChallenges`, `create`, `join`, `getLeaderboard`, `resolveInvite`.

- [ ] **Step 1: Create the service**

Create `src/shared/services/challenges.service.ts`:

```ts
import api from './api';
import type { PostAuthor } from './feed.service';

export type ChallengeMetric = 'streak';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  participantCount: number;
  metric: ChallengeMetric;
  joinedByMe: boolean;
  inviteCode: string;
}

export interface LeaderboardEntry {
  rank: number;
  user: PostAuthor;
  streak: number;
  isMe: boolean;
}

export interface CreateChallengeInput {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
}

export const challengesService = {
  getChallenges: () => api.get<Challenge[]>('/challenges').then((r) => r.data),
  create: (input: CreateChallengeInput) =>
    api.post<Challenge>('/challenges', input).then((r) => r.data),
  join: (id: string) =>
    api.post<Challenge>(`/challenges/${id}/join`).then((r) => r.data),
  getLeaderboard: (id: string) =>
    api.get<LeaderboardEntry[]>(`/challenges/${id}/leaderboard`).then((r) => r.data),
  resolveInvite: (code: string) =>
    api.get<Challenge>(`/challenges/invite/${code}`).then((r) => r.data),
};
```

- [ ] **Step 2: Commit** (controlador decide; pode acumular p/ commit final do plano)

---

### Task 2: Challenges store (Zustand)

**Files:**
- Create: `src/features/challenges/store.ts`
- Test: `src/features/challenges/store.test.ts`

**Interfaces:**
- Produces: `useChallengesStore` com `{ challenges, leaderboardByChallenge, isLoading, isCreating, joiningId, loadingLeaderboardId }` e ações `load`, `create`, `join`, `loadLeaderboard`, `resolveInvite`, `clear`.

- [ ] **Step 1: Write the failing test**

Create `src/features/challenges/store.test.ts`:

```ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useChallengesStore } from './store';
import type { Challenge, LeaderboardEntry } from '@shared/services/challenges.service';

const challenge = (id: string, over: Partial<Challenge> = {}): Challenge => ({
  id,
  title: 'Desafio 7 dias',
  description: 'Registre tudo por 7 dias',
  emoji: '🔥',
  startDate: '2026-06-24',
  endDate: '2026-07-01',
  participantCount: 3,
  metric: 'streak',
  joinedByMe: false,
  inviteCode: 'ABC123',
  ...over,
});

jest.mock('@shared/services/challenges.service', () => ({
  challengesService: {
    getChallenges: jest.fn(),
    create: jest.fn(),
    join: jest.fn(),
    getLeaderboard: jest.fn(),
    resolveInvite: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { challengesService } = require('@shared/services/challenges.service');

describe('useChallengesStore', () => {
  beforeEach(() => {
    useChallengesStore.setState({
      challenges: [],
      leaderboardByChallenge: {},
      isLoading: false,
      isCreating: false,
      joiningId: null,
      loadingLeaderboardId: null,
    });
    jest.clearAllMocks();
  });

  it('load popula challenges', async () => {
    challengesService.getChallenges.mockResolvedValue([challenge('c1')]);
    const { result } = renderHook(() => useChallengesStore());
    await act(() => result.current.load());
    expect(result.current.challenges).toHaveLength(1);
  });

  it('create faz unshift do novo desafio', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1')] });
    challengesService.create.mockResolvedValue(challenge('c2', { title: 'Novo' }));
    const { result } = renderHook(() => useChallengesStore());
    await act(() =>
      result.current.create({ title: 'Novo', description: 'x', startDate: '2026-06-24', endDate: '2026-07-01' }),
    );
    expect(result.current.challenges[0].id).toBe('c2');
  });

  it('join otimista marca joinedByMe e incrementa participantes', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: false, participantCount: 3 })] });
    challengesService.join.mockResolvedValue(challenge('c1', { joinedByMe: true, participantCount: 4 }));
    const { result } = renderHook(() => useChallengesStore());
    await act(() => result.current.join('c1'));
    expect(result.current.challenges[0].joinedByMe).toBe(true);
    expect(result.current.challenges[0].participantCount).toBe(4);
  });

  it('join reverte em erro', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: false, participantCount: 3 })] });
    challengesService.join.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useChallengesStore());
    await act(async () => {
      try {
        await result.current.join('c1');
      } catch {
        /* expected */
      }
    });
    expect(result.current.challenges[0].joinedByMe).toBe(false);
    expect(result.current.challenges[0].participantCount).toBe(3);
  });

  it('loadLeaderboard popula por id', async () => {
    const entries: LeaderboardEntry[] = [{ rank: 1, user: { id: 'u1', name: 'Ana' }, streak: 7, isMe: false }];
    challengesService.getLeaderboard.mockResolvedValue(entries);
    const { result } = renderHook(() => useChallengesStore());
    await act(() => result.current.loadLeaderboard('c1'));
    expect(result.current.leaderboardByChallenge.c1).toHaveLength(1);
  });

  it('resolveInvite retorna o desafio e o insere se ausente', async () => {
    challengesService.resolveInvite.mockResolvedValue(challenge('c9'));
    const { result } = renderHook(() => useChallengesStore());
    let resolved: Challenge | undefined;
    await act(async () => {
      resolved = await result.current.resolveInvite('ABC123');
    });
    expect(resolved?.id).toBe('c9');
    expect(result.current.challenges.find((c) => c.id === 'c9')).toBeTruthy();
  });

  it('clear zera o estado', () => {
    useChallengesStore.setState({ challenges: [challenge('c1')] });
    useChallengesStore.getState().clear();
    expect(useChallengesStore.getState().challenges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test → RED** (`npx jest src/features/challenges/store.test.ts`)

- [ ] **Step 3: Implement the store**

Create `src/features/challenges/store.ts`:

```ts
import { Alert } from 'react-native';
import { create } from 'zustand';
import {
  challengesService,
  Challenge,
  LeaderboardEntry,
  CreateChallengeInput,
} from '@shared/services/challenges.service';

interface ChallengesState {
  challenges: Challenge[];
  leaderboardByChallenge: Record<string, LeaderboardEntry[]>;
  isLoading: boolean;
  isCreating: boolean;
  joiningId: string | null;
  loadingLeaderboardId: string | null;

  load: () => Promise<void>;
  create: (input: CreateChallengeInput) => Promise<Challenge>;
  join: (challengeId: string) => Promise<void>;
  loadLeaderboard: (challengeId: string) => Promise<void>;
  resolveInvite: (code: string) => Promise<Challenge>;
  clear: () => void;
}

const initialState = {
  challenges: [] as Challenge[],
  leaderboardByChallenge: {} as Record<string, LeaderboardEntry[]>,
  isLoading: false,
  isCreating: false,
  joiningId: null as string | null,
  loadingLeaderboardId: null as string | null,
};

export const useChallengesStore = create<ChallengesState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const challenges = await challengesService.getChallenges();
      set({ challenges, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  create: async (input) => {
    set({ isCreating: true });
    try {
      const created = await challengesService.create(input);
      set((s) => ({ challenges: [created, ...s.challenges], isCreating: false }));
      return created;
    } catch (e) {
      set({ isCreating: false });
      throw e;
    }
  },

  join: async (challengeId) => {
    const target = get().challenges.find((c) => c.id === challengeId);
    if (!target || target.joinedByMe) return;
    const snapshot = { joinedByMe: target.joinedByMe, participantCount: target.participantCount };
    set((s) => ({
      joiningId: challengeId,
      challenges: s.challenges.map((c) =>
        c.id === challengeId ? { ...c, joinedByMe: true, participantCount: c.participantCount + 1 } : c,
      ),
    }));
    try {
      const updated = await challengesService.join(challengeId);
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? updated : c)),
      }));
    } catch (e) {
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? { ...c, ...snapshot } : c)),
      }));
      Alert.alert('Não foi possível entrar no desafio', 'Tente novamente.');
      throw e;
    }
  },

  loadLeaderboard: async (challengeId) => {
    set({ loadingLeaderboardId: challengeId });
    try {
      const entries = await challengesService.getLeaderboard(challengeId);
      set((s) => ({
        loadingLeaderboardId: null,
        leaderboardByChallenge: { ...s.leaderboardByChallenge, [challengeId]: entries },
      }));
    } catch {
      set({ loadingLeaderboardId: null });
    }
  },

  resolveInvite: async (code) => {
    const challenge = await challengesService.resolveInvite(code);
    set((s) => ({
      challenges: s.challenges.some((c) => c.id === challenge.id)
        ? s.challenges.map((c) => (c.id === challenge.id ? challenge : c))
        : [challenge, ...s.challenges],
    }));
    return challenge;
  },

  clear: () => set({ ...initialState }),
}));
```

- [ ] **Step 4: Run test → GREEN** (7 testes)

---

### Task 3: Componentes — `ChallengeCard`, `LeaderboardRow`, `InviteButton`, empty state

**Files:**
- Create: `src/features/challenges/components/ChallengeCard.tsx`
- Create: `src/features/challenges/components/LeaderboardRow.tsx`
- Create: `src/features/challenges/components/InviteButton.tsx`
- Create: `src/features/challenges/components/EmptyChallengesState.tsx`
- Test: `src/features/challenges/components/LeaderboardRow.test.tsx`

**Interfaces:**
- `ChallengeCard({ challenge, onPress, onJoin, joining })`
- `LeaderboardRow({ entry })`
- `InviteButton({ inviteCode, title })`
- `EmptyChallengesState({ onCreate })`

- [ ] **Step 1: Write the failing test** — `src/features/challenges/components/LeaderboardRow.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { LeaderboardRow } from './LeaderboardRow';
import type { LeaderboardEntry } from '@shared/services/challenges.service';

const entry = (over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  user: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  streak: 7,
  isMe: false,
  ...over,
});

describe('LeaderboardRow', () => {
  it('mostra posição, nome e streak', () => {
    const { getByText } = render(<LeaderboardRow entry={entry()} />);
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(getByText('🔥 7')).toBeTruthy();
  });

  it('destaca a linha do próprio usuário (isMe)', () => {
    const { getByTestId } = render(<LeaderboardRow entry={entry({ isMe: true })} />);
    expect(getByTestId('leaderboard-row').props.accessibilityState.selected).toBe(true);
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement `LeaderboardRow`** — `src/features/challenges/components/LeaderboardRow.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Avatar } from '@shared/components/Avatar';
import type { LeaderboardEntry } from '@shared/services/challenges.service';

export function LeaderboardRow({ entry }: { entry: LeaderboardEntry }): React.JSX.Element {
  const isTop3 = entry.rank <= 3;
  return (
    <View
      testID='leaderboard-row'
      accessibilityState={{ selected: entry.isMe }}
      style={[styles.row, entry.isMe && styles.rowMe]}
    >
      <View style={[styles.rankBadge, isTop3 && styles.rankBadgeTop]}>
        <Text style={[styles.rankText, isTop3 && styles.rankTextTop]}>{entry.rank}</Text>
      </View>
      <Avatar size='sm' emoji={entry.user.avatarEmoji ?? '🙂'} backgroundColor={colors.brandMutedSurface} />
      <Text style={styles.name}>{entry.user.name}</Text>
      <Text style={styles.streak}>🔥 {entry.streak}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  rowMe: { backgroundColor: colors.brandSupportSoft },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandMutedSurface, alignItems: 'center', justifyContent: 'center' },
  rankBadgeTop: { backgroundColor: colors.brandSupport },
  rankText: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.bold },
  rankTextTop: { color: colors.brandAnchor },
  name: { flex: 1, fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  streak: { fontSize: 14, color: colors.brandText, fontFamily: typography.fontFamily.medium },
});
```

- [ ] **Step 4: Run → GREEN**

- [ ] **Step 5: Implement `ChallengeCard`, `InviteButton`, `EmptyChallengesState`**

`src/features/challenges/components/ChallengeCard.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Card } from '@shared/components/Card';
import { Button } from '@shared/components/Button';
import { formatChipLabel } from '@shared/utils/date';
import type { Challenge } from '@shared/services/challenges.service';

interface Props {
  challenge: Challenge;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
}

export function ChallengeCard({ challenge, onPress, onJoin, joining }: Props): React.JSX.Element {
  return (
    <Card onPress={onPress} style={styles.card} testID={`challenge-${challenge.id}`}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{challenge.emoji}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.meta}>
            {formatChipLabel(challenge.startDate)} – {formatChipLabel(challenge.endDate)} · {challenge.participantCount} participantes
          </Text>
        </View>
      </View>
      <Text style={styles.description} numberOfLines={2}>{challenge.description}</Text>
      {challenge.joinedByMe ? (
        <View style={styles.joinedBadge}>
          <Text style={styles.joinedText}>✓ Participando</Text>
        </View>
      ) : (
        <Button size='sm' onPress={onJoin} loading={joining}>Participar</Button>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 30 },
  headerText: { flex: 1 },
  title: { fontSize: 17, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  meta: { fontSize: 12, color: colors.brandTextMuted, marginTop: 2 },
  description: { fontSize: 14, color: colors.brandText, lineHeight: 20 },
  joinedBadge: { alignSelf: 'flex-start', backgroundColor: colors.brandSupportSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  joinedText: { fontSize: 13, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
});
```

`src/features/challenges/components/InviteButton.tsx`:

```tsx
import React from 'react';
import { Share } from 'react-native';
import { Button } from '@shared/components/Button';

interface Props {
  inviteCode: string;
  title: string;
}

export function InviteButton({ inviteCode, title }: Props): React.JSX.Element {
  const onPress = async () => {
    const url = `caloria://challenge/${inviteCode}`;
    try {
      await Share.share({
        message: `Bora pro desafio "${title}" no CalorIA? Entre por aqui: ${url}`,
        url,
      });
    } catch {
      /* usuário cancelou o share */
    }
  };

  return (
    <Button variant='secondary' onPress={onPress}>
      Convidar amigos
    </Button>
  );
}
```

`src/features/challenges/components/EmptyChallengesState.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';

export function EmptyChallengesState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🏆</Text>
      <Text style={styles.title}>Nenhum desafio ainda</Text>
      <Text style={styles.subtitle}>Crie um desafio e convide seus amigos para participar.</Text>
      <Button onPress={onCreate}>Criar desafio</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 8 },
  emoji: { fontSize: 44 },
  title: { fontSize: 17, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: 14, color: colors.brandTextMuted, textAlign: 'center', marginBottom: 8 },
});
```

> Confirme as props reais de `Button` (`variant`, `size`, `loading`, `children`) em `src/shared/components/Button.tsx` e ajuste se necessário.

- [ ] **Step 6: Run `npx jest src/features/challenges/components` → GREEN**

---

### Task 4: Telas — `ChallengesScreen`, `CreateChallengeScreen`, `ChallengeLeaderboardScreen`

**Files:**
- Create: `src/features/challenges/screens/ChallengesScreen.tsx`
- Create: `src/features/challenges/screens/CreateChallengeScreen.tsx`
- Create: `src/features/challenges/screens/ChallengeLeaderboardScreen.tsx`
- Test: `src/features/challenges/screens/ChallengesScreen.test.tsx`

**Interfaces:** as três telas (named exports), tipadas com `CommunityStackScreenProps<...>` (rotas adicionadas na Task 5).

> Para o teste, passe `navigation`/`route` mockados. Como os tipos de navegação só ganham as rotas de challenge na Task 5, tipe as telas de forma mínima nesta task e re-tipe na Task 5 (ou faça Task 5 logo após e rode os testes no fim).

- [ ] **Step 1: Write the failing test** — `src/features/challenges/screens/ChallengesScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ChallengesScreen } from './ChallengesScreen';
import { useChallengesStore } from '../store';
import type { Challenge } from '@shared/services/challenges.service';

jest.mock('@shared/services/challenges.service', () => ({
  challengesService: {
    getChallenges: jest.fn(),
    create: jest.fn(),
    join: jest.fn(),
    getLeaderboard: jest.fn(),
    resolveInvite: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { challengesService } = require('@shared/services/challenges.service');

const challenge: Challenge = {
  id: 'c1',
  title: 'Desafio 7 dias',
  description: 'Registre tudo',
  emoji: '🔥',
  startDate: '2026-06-24',
  endDate: '2026-07-01',
  participantCount: 3,
  metric: 'streak',
  joinedByMe: false,
  inviteCode: 'ABC',
};

const navigation = { navigate: jest.fn() } as never;

describe('ChallengesScreen', () => {
  beforeEach(() => {
    useChallengesStore.getState().clear();
    jest.clearAllMocks();
  });

  it('lista desafios no mount', async () => {
    challengesService.getChallenges.mockResolvedValue([challenge]);
    const { getByText } = render(<ChallengesScreen navigation={navigation} route={{ key: 'k', name: 'Challenges' } as never} />);
    await waitFor(() => expect(getByText('Desafio 7 dias')).toBeTruthy());
  });

  it('mostra empty state quando vazio', async () => {
    challengesService.getChallenges.mockResolvedValue([]);
    const { getByText } = render(<ChallengesScreen navigation={navigation} route={{ key: 'k', name: 'Challenges' } as never} />);
    await waitFor(() => expect(getByText('Nenhum desafio ainda')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run → RED**

- [ ] **Step 3: Implement `ChallengesScreen`** — `src/features/challenges/screens/ChallengesScreen.tsx`:

```tsx
import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useChallengesStore } from '../store';
import { ChallengeCard } from '../components/ChallengeCard';
import { EmptyChallengesState } from '../components/EmptyChallengesState';
import { MealCardSkeleton } from '@features/diet/components/MealCardSkeleton';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Challenges'>;

export function ChallengesScreen({ navigation }: Props): React.JSX.Element {
  const challenges = useChallengesStore((s) => s.challenges);
  const isLoading = useChallengesStore((s) => s.isLoading);
  const joiningId = useChallengesStore((s) => s.joiningId);
  const load = useChallengesStore((s) => s.load);
  const join = useChallengesStore((s) => s.join);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const goCreate = () => navigation.navigate('CreateChallenge');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafios</Text>
      </View>

      {isLoading && challenges.length === 0 ? (
        <View style={styles.listContent}>
          {[0, 1].map((i) => (
            <MealCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              joining={joiningId === item.id}
              onJoin={() => join(item.id).catch(() => {})}
              onPress={() => navigation.navigate('ChallengeLeaderboard', { challengeId: item.id })}
            />
          )}
          ListEmptyComponent={<EmptyChallengesState onCreate={goCreate} />}
        />
      )}

      <Pressable style={styles.fab} onPress={goCreate} accessibilityRole='button' accessibilityLabel='Criar desafio'>
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 24, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  listContent: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  fabIcon: { fontSize: 28, color: colors.white, lineHeight: 30 },
});
```

- [ ] **Step 4: Run → GREEN**

- [ ] **Step 5: Implement `CreateChallengeScreen`** — `src/features/challenges/screens/CreateChallengeScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme';
import { Input } from '@shared/components/Input';
import { Button } from '@shared/components/Button';
import { useChallengesStore } from '../store';
import { todayString, dateToString } from '@shared/utils/date';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'CreateChallenge'>;

function plusDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateToString(d);
}

export function CreateChallengeScreen({ navigation }: Props): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const isCreating = useChallengesStore((s) => s.isCreating);
  const create = useChallengesStore((s) => s.create);

  const canSubmit = title.trim().length > 0 && !isCreating;

  const submit = async () => {
    const start = todayString();
    try {
      const created = await create({
        title: title.trim(),
        description: description.trim(),
        startDate: start,
        endDate: plusDays(start, 7),
      });
      navigation.replace('ChallengeLeaderboard', { challengeId: created.id });
    } catch {
      /* store já alerta em erro de rede */
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Input label='Título do desafio' value={title} onChangeText={setTitle} placeholder='Ex: 7 dias registrando tudo' />
        <Input label='Descrição' value={description} onChangeText={setDescription} placeholder='Conte a regra do desafio' multiline />
      </ScrollView>
      <View style={styles.footer}>
        <Button onPress={submit} disabled={!canSubmit} loading={isCreating}>Criar e convidar</Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 20, gap: 16 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
```

> O período fixo de 7 dias é o default do MVP (métrica é streak). Seletor de datas é follow-up (não há date picker instalado).

- [ ] **Step 6: Implement `ChallengeLeaderboardScreen`** — `src/features/challenges/screens/ChallengeLeaderboardScreen.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useChallengesStore } from '../store';
import { LeaderboardRow } from '../components/LeaderboardRow';
import { InviteButton } from '../components/InviteButton';
import type { Challenge } from '@shared/services/challenges.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'ChallengeLeaderboard'>;

export function ChallengeLeaderboardScreen({ route }: Props): React.JSX.Element {
  const { challengeId, code } = route.params;
  const challenges = useChallengesStore((s) => s.challenges);
  const leaderboardByChallenge = useChallengesStore((s) => s.leaderboardByChallenge);
  const loadingId = useChallengesStore((s) => s.loadingLeaderboardId);
  const loadLeaderboard = useChallengesStore((s) => s.loadLeaderboard);
  const resolveInvite = useChallengesStore((s) => s.resolveInvite);

  const [resolvedId, setResolvedId] = useState<string | undefined>(challengeId);

  useEffect(() => {
    let active = true;
    async function init() {
      let id = challengeId;
      if (!id && code) {
        const challenge: Challenge = await resolveInvite(code);
        id = challenge.id;
      }
      if (active && id) {
        setResolvedId(id);
        loadLeaderboard(id);
      }
    }
    init().catch(() => {});
    return () => {
      active = false;
    };
  }, [challengeId, code, loadLeaderboard, resolveInvite]);

  const challenge = challenges.find((c) => c.id === resolvedId);
  const entries = resolvedId ? leaderboardByChallenge[resolvedId] ?? [] : [];
  const isLoading = loadingId === resolvedId && entries.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.rank}-${e.user.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{challenge?.title ?? 'Ranking'}</Text>
            {challenge ? <Text style={styles.subtitle}>{challenge.participantCount} participantes · por sequência</Text> : null}
            {challenge ? (
              <View style={styles.invite}>
                <InviteButton inviteCode={challenge.inviteCode} title={challenge.title} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <LeaderboardRow entry={item} />}
        ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.brandPrimary} style={styles.loader} /> : <Text style={styles.empty}>Ranking ainda vazio.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  list: { padding: 16, flexGrow: 1 },
  header: { marginBottom: 12, gap: 4 },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: 13, color: colors.brandTextMuted },
  invite: { marginTop: 12 },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: 32, fontSize: 14 },
});
```

- [ ] **Step 7: Run `npx jest src/features/challenges/screens/ChallengesScreen.test.tsx` → GREEN**

---

### Task 5: Integrar na navegação + deep link + atalho no Feed

**Files:**
- Modify: `src/navigation/types.ts` (add rotas de challenge ao `CommunityStackParamList`)
- Modify: `src/navigation/CommunityNavigator.tsx` (registrar as 3 telas)
- Modify: `src/navigation/RootNavigator.tsx` (deep link `challenge/:code`)
- Modify: `src/features/feed/screens/FeedScreen.tsx` (atalho 🏆 no header → Challenges)

- [ ] **Step 1: Extend `CommunityStackParamList`** em `src/navigation/types.ts`:

```ts
export type CommunityStackParamList = {
  Feed: undefined;
  CreatePost: undefined;
  PostComments: { postId: string };
  Challenges: undefined;
  CreateChallenge: undefined;
  ChallengeLeaderboard: { challengeId?: string; code?: string };
  // Notifications é adicionada no Plano 3.
};
```

- [ ] **Step 2: Registrar telas no `CommunityNavigator`** — imports + screens:

```tsx
import { ChallengesScreen } from '@features/challenges/screens/ChallengesScreen';
import { CreateChallengeScreen } from '@features/challenges/screens/CreateChallengeScreen';
import { ChallengeLeaderboardScreen } from '@features/challenges/screens/ChallengeLeaderboardScreen';
```
```tsx
      <Stack.Screen name='Challenges' component={ChallengesScreen} options={{ headerShown: false }} />
      <Stack.Screen name='CreateChallenge' component={CreateChallengeScreen} options={{ presentation: 'modal', title: 'Novo desafio' }} />
      <Stack.Screen name='ChallengeLeaderboard' component={ChallengeLeaderboardScreen} options={{ title: 'Ranking' }} />
```

- [ ] **Step 3: Deep link no `RootNavigator`** — dentro de `...Community.screens`, adicionar:

```tsx
              ChallengeLeaderboard: 'challenge/:code',
```

- [ ] **Step 4: Atalho "Desafios" no header do Feed** — em `src/features/feed/screens/FeedScreen.tsx`, atualizar o header para incluir um botão 🏆 à direita que faz `navigation.navigate('Challenges')` (e estilo `headerActions`/`headerAction`). Manter o header existente (título "Comunidade").

- [ ] **Step 5: Run `npx jest src/features/feed src/features/challenges` → GREEN, pristine**

---

### Task 6: Handlers MSW de desafios + registro + logout

**Files:**
- Create: `mocks/handlers/challenges.ts`
- Modify: `mocks/server.ts` (registrar `challengesHandlers`)
- Modify: `src/features/auth/store.ts` (`clearToken` chama `useChallengesStore.getState().clear()`)

- [ ] **Step 1: Create the MSW handlers** — `mocks/handlers/challenges.ts`:

```ts
import { http, HttpResponse } from 'msw';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}
interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  metric: 'streak';
  joinedByMe: boolean;
  inviteCode: string;
}
interface LeaderboardEntry {
  rank: number;
  user: PostAuthor;
  streak: number;
  isMe: boolean;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

let challenges: Challenge[] = [
  {
    id: 'ch1',
    title: 'Sequência de 7 dias',
    description: 'Registre todas as refeições por 7 dias seguidos.',
    emoji: '🔥',
    startDate: isoDate(-2),
    endDate: isoDate(5),
    participantCount: 4,
    metric: 'streak',
    joinedByMe: true,
    inviteCode: 'STREAK7',
  },
  {
    id: 'ch2',
    title: 'Hidratação total',
    description: 'Bata a meta de água todos os dias da semana.',
    emoji: '💧',
    startDate: isoDate(0),
    endDate: isoDate(7),
    participantCount: 2,
    metric: 'streak',
    joinedByMe: false,
    inviteCode: 'AGUA',
  },
];

const leaderboards: Record<string, LeaderboardEntry[]> = {
  ch1: [
    { rank: 1, user: { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' }, streak: 7, isMe: false },
    { rank: 2, user: { id: 'me', name: 'Você', avatarEmoji: '😎' }, streak: 5, isMe: true },
    { rank: 3, user: { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' }, streak: 4, isMe: false },
  ],
};

let seq = 10;

export const challengesHandlers = [
  http.get('*/challenges', () => HttpResponse.json(challenges)),

  http.post('*/challenges', async ({ request }) => {
    const body = (await request.json()) as { title: string; description: string; startDate: string; endDate: string };
    const id = `ch-${seq++}`;
    const created: Challenge = {
      id,
      title: body.title,
      description: body.description,
      emoji: '🏆',
      startDate: body.startDate,
      endDate: body.endDate,
      participantCount: 1,
      metric: 'streak',
      joinedByMe: true,
      inviteCode: id.toUpperCase(),
    };
    challenges = [created, ...challenges];
    leaderboards[id] = [{ rank: 1, user: { id: 'me', name: 'Você', avatarEmoji: '😎' }, streak: 0, isMe: true }];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/challenges/:id/join', ({ params }) => {
    const challenge = challenges.find((c) => c.id === params.id);
    if (!challenge) return new HttpResponse(null, { status: 404 });
    if (!challenge.joinedByMe) {
      challenge.joinedByMe = true;
      challenge.participantCount += 1;
    }
    return HttpResponse.json(challenge);
  }),

  http.get('*/challenges/:id/leaderboard', ({ params }) =>
    HttpResponse.json(leaderboards[params.id as string] ?? []),
  ),

  http.get('*/challenges/invite/:code', ({ params }) => {
    const challenge = challenges.find((c) => c.inviteCode === params.code);
    if (!challenge) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(challenge);
  }),
];
```

- [ ] **Step 2: Registrar em `mocks/server.ts`** (`import { challengesHandlers }` + `...challengesHandlers,`)

- [ ] **Step 3: Logout** — em `src/features/auth/store.ts`: `import { useChallengesStore } from '@features/challenges/store';` e `useChallengesStore.getState().clear();` em `clearToken`.

- [ ] **Step 4: Run `npx jest src/features/challenges` → GREEN**

---

### Task 7: Fechamento do Plano 2

- [ ] **Step 1: Suite do módulo** — `npx jest src/features/challenges src/features/feed` → tudo verde, pristine.
- [ ] **Step 2: Smoke manual (web)** — `npm run web`: header do Feed tem 🏆 → lista de desafios; participar muda badge/contador; card → leaderboard com "Você" destacada; "Convidar amigos" abre Share; criar desafio leva ao ranking.
- [ ] **Step 3:** Commit final do Plano 2 (controlador).

## Self-Review (cobertura vs spec)

- Listar desafios ativos: Task 4 (`ChallengesScreen`) + Task 6 (MSW). ✅
- Criar desafio + convidar via link: Task 4 (`CreateChallengeScreen`), Task 3 (`InviteButton` Share), Task 5 (deep link). ✅
- Ranking por streak (posição/avatar): Task 3 (`LeaderboardRow`), Task 4 (`ChallengeLeaderboardScreen`). ✅
- Identidade VITAL LIGHT: tokens de `@theme`; top-3 e `isMe` em `brandSupport`. ✅
- Deep link `caloria://challenge/:code` via `GET /challenges/invite/:code`: Task 2 (`resolveInvite`), Task 5, Task 6. ✅
- Logout limpa store: Task 6. ✅
- Out of scope: seletor de datas custom (período fixo 7 dias); métricas além de streak.
