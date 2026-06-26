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
