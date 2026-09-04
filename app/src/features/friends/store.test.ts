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
