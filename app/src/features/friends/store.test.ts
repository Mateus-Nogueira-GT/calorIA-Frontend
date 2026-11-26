import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useFriendsStore } from './store';
import type { UserSearchResult } from '@shared/services/friends.service';

const user = (id: string, username: string): UserSearchResult => ({
  id,
  username,
  name: username,
  avatarUrl: null,
  relationship: 'none',
});

jest.mock('@shared/services/friends.service', () => ({
  friendsService: {
    getFriends: jest.fn(),
    getRequests: jest.fn(),
    search: jest.fn(),
    sendRequest: jest.fn(),
    respond: jest.fn(),
    removeFriend: jest.fn(),
    list: jest.fn(),
    requests: jest.fn(),
    respondRequest: jest.fn(),
    remove: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { friendsService } = require('@shared/services/friends.service');

describe('useFriendsStore — busca', () => {
  beforeEach(() => {
    useFriendsStore.getState().clear();
    jest.clearAllMocks();
  });

  it('descarta resposta que chega fora de ordem (L2)', async () => {
    // O debounce reduz mas não elimina buscas concorrentes: digitando rápido, a
    // resposta de "ana" podia chegar depois da de "anab" e sobrescrever a lista
    // com resultados do termo antigo.
    let resolveLenta: (v: UserSearchResult[]) => void = () => {};
    friendsService.search
      .mockImplementationOnce(
        () => new Promise<UserSearchResult[]>((resolve) => { resolveLenta = resolve; }),
      )
      .mockResolvedValueOnce([user('2', 'anab')]);

    const { result } = renderHook(() => useFriendsStore());

    await act(async () => {
      const lenta = result.current.search('ana'); // fica pendente
      await result.current.search('anab'); // resolve primeiro
      resolveLenta([user('1', 'ana')]); // resposta atrasada do termo ANTIGO
      await lenta;
    });

    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0].username).toBe('anab');
  });

  it('busca curta limpa os resultados e invalida o que está em voo', async () => {
    let resolveLenta: (v: UserSearchResult[]) => void = () => {};
    friendsService.search.mockImplementationOnce(
      () => new Promise<UserSearchResult[]>((resolve) => { resolveLenta = resolve; }),
    );
    const { result } = renderHook(() => useFriendsStore());

    await act(async () => {
      const lenta = result.current.search('ana');
      await result.current.search('a'); // < 2 caracteres: limpa
      resolveLenta([user('1', 'ana')]);
      await lenta;
    });

    expect(result.current.searchResults).toHaveLength(0);
  });

  it('busca normal popula os resultados', async () => {
    friendsService.search.mockResolvedValue([user('1', 'ana')]);
    const { result } = renderHook(() => useFriendsStore());

    await act(() => result.current.search('ana'));

    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.isSearching).toBe(false);
  });
});

describe('useFriendsStore — troca de conta com a requisição pendente (R5, 26/11)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require('@features/auth/store');
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
  const friend = { id: 'f1', username: 'ana', name: 'Ana', avatarUrl: null, friendshipId: 'fs1', currentStreak: 3 };
  const request = { id: 'r1', status: 'pending', createdAt: '2026-11-26', user: user('f2', 'bia') };
  const initial = () => {
    const { friends, incoming, outgoing, searchResults, hasLoaded, isLoading, isSearching, error } =
      useFriendsStore.getState();
    return { friends, incoming, outgoing, searchResults, hasLoaded, isLoading, isSearching, error };
  };
  const cleared = {
    friends: [],
    incoming: [],
    outgoing: [],
    searchResults: [],
    hasLoaded: false,
    isLoading: false,
    isSearching: false,
    error: null,
  };
  beforeEach(() => {
    signIn('uA');
    jest.clearAllMocks();
  });

  it('load descarta os amigos da conta anterior', async () => {
    const list = deferred<unknown[]>();
    friendsService.list.mockReturnValue(list.promise);
    friendsService.requests.mockResolvedValue({ incoming: [request], outgoing: [] });
    const loading = useFriendsStore.getState().load();
    signIn('uB');
    list.resolve([friend]);
    await loading;
    expect(initial()).toEqual(cleared);
  });

  it('busca da conta anterior não aparece na próxima', async () => {
    const found = deferred<UserSearchResult[]>();
    friendsService.search.mockReturnValue(found.promise);
    const searching = useFriendsStore.getState().search('ana');
    signIn('uB');
    found.resolve([user('1', 'ana')]);
    await searching;
    expect(initial()).toEqual(cleared);
  });

  it('pedido enviado pela conta anterior não marca o resultado da próxima nem recarrega', async () => {
    const sent = deferred<void>();
    friendsService.sendRequest.mockReturnValue(sent.promise);
    const sending = useFriendsStore.getState().sendRequest('ana');
    signIn('uB');
    useFriendsStore.setState({ searchResults: [user('1', 'ana')] });
    sent.resolve();
    await sending;
    expect(useFriendsStore.getState().searchResults[0].relationship).toBe('none');
    expect(friendsService.list).not.toHaveBeenCalled();
  });

  it('rollback de respond e removeFriend não restaura dados da conta anterior', async () => {
    useFriendsStore.setState({ incoming: [request as never], friends: [friend as never] });
    const responded = deferred<void>();
    friendsService.respondRequest.mockReturnValue(responded.promise);
    const removed = deferred<void>();
    friendsService.remove.mockReturnValue(removed.promise);
    const responding = useFriendsStore.getState().respond('r1', 'accept');
    const removing = useFriendsStore.getState().removeFriend('fs1');
    signIn('uB');
    responded.reject(new Error('cancelada'));
    removed.reject(new Error('cancelada'));
    await Promise.all([responding, removing]);
    expect(initial()).toEqual(cleared);
  });
});
