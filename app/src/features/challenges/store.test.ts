import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useChallengesStore } from './store';
import { useAuthStore } from '@features/auth/store';
import { todayString } from '@shared/utils/date';
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
  finished: false,
  ...over,
});

jest.mock('@shared/services/challenges.service', () => ({
  challengesService: {
    getChallenges: jest.fn(),
    create: jest.fn(),
    join: jest.fn(),
    getLeaderboard: jest.fn(),
    resolveInvite: jest.fn(),
    checkIn: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { challengesService } = require('@shared/services/challenges.service');
jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { showAlert } = require('@shared/utils/show-alert');

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

  it('ignora o segundo toque enquanto o check-in está em voo (B3)', async () => {
    // Dois toques rápidos passavam os dois pela guarda do servidor: a segunda
    // transação zerava a sequência (current_streak voltava para 1).
    challengesService.getLeaderboard.mockResolvedValue([] as LeaderboardEntry[]);
    challengesService.checkIn.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 10)),
    );
    const { result } = renderHook(() => useChallengesStore());

    await act(async () => {
      await Promise.all([result.current.checkIn('c1'), result.current.checkIn('c1')]);
    });

    expect(challengesService.checkIn).toHaveBeenCalledTimes(1);
  });

  it('libera novo check-in depois que o anterior termina', async () => {
    challengesService.getLeaderboard.mockResolvedValue([] as LeaderboardEntry[]);
    challengesService.checkIn.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useChallengesStore());

    await act(async () => {
      await result.current.checkIn('c1');
    });
    expect(useChallengesStore.getState().checkingInId).toBeNull();

    await act(async () => {
      await result.current.checkIn('c1');
    });
    expect(challengesService.checkIn).toHaveBeenCalledTimes(2);
  });

  it('depois do check-in, o desafio fica marcado como feito hoje', async () => {
    challengesService.getLeaderboard.mockResolvedValue([] as LeaderboardEntry[]);
    challengesService.checkIn.mockResolvedValue({ ok: true });
    useChallengesStore.setState({
      challenges: [challenge('c1', { joinedByMe: true }), challenge('c2', { joinedByMe: true })],
    });

    await act(async () => {
      await useChallengesStore.getState().checkIn('c1');
    });

    const [c1, c2] = useChallengesStore.getState().challenges;
    expect(c1!.myLastCheckIn).toBe(todayString());
    expect(c2!.myLastCheckIn).toBeUndefined();
  });

  it('"já fez check-in hoje" (409) também marca o desafio como feito', async () => {
    challengesService.checkIn.mockRejectedValue({
      response: { status: 409, data: { error: 'ALREADY_CHECKED_IN' } },
    });
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: true })] });

    await act(async () => {
      await useChallengesStore.getState().checkIn('c1');
    });

    expect(useChallengesStore.getState().challenges[0]!.myLastCheckIn).toBe(todayString());
  });

  it('load mantém o desafio de convite ainda não aceito (S5)', async () => {
    const invited = challenge('c9', { joinedByMe: false });
    challengesService.resolveInvite.mockResolvedValue(invited);
    // GET /challenges só lista desafios dos quais sou membro.
    challengesService.getChallenges.mockResolvedValue([challenge('c1', { joinedByMe: true })]);

    await useChallengesStore.getState().resolveInvite('ABC123');
    await useChallengesStore.getState().load();

    const list = useChallengesStore.getState().challenges;
    expect(list.map((c) => c.id)).toEqual(['c9', 'c1']);
    expect(list[0].joinedByMe).toBe(false);
  });

  it('convite resolvido durante o load também sobrevive', async () => {
    let resolveList!: (v: Challenge[]) => void;
    challengesService.getChallenges.mockReturnValue(
      new Promise<Challenge[]>((r) => {
        resolveList = r;
      }),
    );
    challengesService.resolveInvite.mockResolvedValue(challenge('c9'));

    const loading = useChallengesStore.getState().load();
    await useChallengesStore.getState().resolveInvite('ABC123');
    resolveList([]);
    await loading;

    expect(useChallengesStore.getState().challenges.map((c) => c.id)).toEqual(['c9']);
  });

  it('load descarta desafio já aceito que o servidor não devolve mais', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: true })] });
    challengesService.getChallenges.mockResolvedValue([]);

    await useChallengesStore.getState().load();

    expect(useChallengesStore.getState().challenges).toEqual([]);
  });

  it('load descarta a resposta que chega depois de trocar de conta (S10)', async () => {
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('token-a', { id: 'uA', name: 'A', email: 'a@exemplo.com' });
    let resolveList!: (v: Challenge[]) => void;
    challengesService.getChallenges.mockReturnValue(
      new Promise<Challenge[]>((r) => {
        resolveList = r;
      }),
    );

    const loading = useChallengesStore.getState().load();
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('token-b', { id: 'uB', name: 'B', email: 'b@exemplo.com' });
    resolveList([challenge('cA', { joinedByMe: true })]);
    await loading;

    expect(useChallengesStore.getState().challenges).toEqual([]);
    expect(useChallengesStore.getState().isLoading).toBe(false);
  });
});

describe('useChallengesStore — troca de conta com a requisição pendente (R5, 26/11)', () => {
  const signIn = (id: string) => {
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken(`token-${id}`, { id, name: id, email: `${id}@exemplo.com` });
  };
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((a, b) => {
      resolve = a;
      reject = b;
    });
    return { promise, resolve, reject };
  };
  beforeEach(() => {
    signIn('uA');
    jest.clearAllMocks();
  });

  it('desafio criado pela conta anterior não entra na lista da próxima', async () => {
    const created = deferred<Challenge>();
    challengesService.create.mockReturnValue(created.promise);
    const creating = useChallengesStore.getState().create({ title: 'x' } as never);
    signIn('uB');
    created.resolve(challenge('cA', { joinedByMe: true }));
    await creating.catch(() => undefined);
    expect(useChallengesStore.getState()).toMatchObject({ challenges: [], isCreating: false });
  });

  it('entrada da conta anterior não altera o mesmo desafio na próxima nem avisa', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1')] });
    const joined = deferred<Challenge>();
    challengesService.join.mockReturnValue(joined.promise);
    const joining = useChallengesStore.getState().join('c1');
    signIn('uB');
    useChallengesStore.setState({ challenges: [challenge('c1', { participantCount: 9 })] });
    joined.reject(new Error('cancelada'));
    await joining.catch(() => undefined);
    expect(useChallengesStore.getState().challenges[0]).toMatchObject({
      joinedByMe: false,
      participantCount: 9,
    });
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('check-in da conta anterior não marca o desafio da próxima', async () => {
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: true })] });
    const done = deferred<void>();
    challengesService.checkIn.mockReturnValue(done.promise);
    const checking = useChallengesStore.getState().checkIn('c1');
    signIn('uB');
    useChallengesStore.setState({ challenges: [challenge('c1', { joinedByMe: true })] });
    done.resolve();
    await checking;
    expect(useChallengesStore.getState().challenges[0].myLastCheckIn).toBeUndefined();
    expect(challengesService.getLeaderboard).not.toHaveBeenCalled();
  });

  it('ranking e convite resolvidos pela conta anterior não entram na próxima', async () => {
    const board = deferred<LeaderboardEntry[]>();
    challengesService.getLeaderboard.mockReturnValue(board.promise);
    const invite = deferred<Challenge>();
    challengesService.resolveInvite.mockReturnValue(invite.promise);
    const loading = useChallengesStore.getState().loadLeaderboard('c1');
    const resolving = useChallengesStore.getState().resolveInvite('CODE');
    signIn('uB');
    board.resolve([{ rank: 1, user: { id: 'uA', name: 'A' }, streak: 3, isMe: true } as never]);
    invite.resolve(challenge('cA'));
    await Promise.all([loading, resolving.catch(() => undefined)]);
    expect(useChallengesStore.getState()).toMatchObject({
      challenges: [],
      leaderboardByChallenge: {},
      loadingLeaderboardId: null,
    });
  });
});
