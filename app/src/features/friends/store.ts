import { create } from 'zustand';
import {
  friendsService,
  Friend,
  FriendRequest,
  UserSearchResult,
} from '@shared/services/friends.service';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

interface FriendsState {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  searchResults: UserSearchResult[];
  hasLoaded: boolean;
  isLoading: boolean;
  isSearching: boolean;
  error: string | null;
  load: () => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  sendRequest: (username: string) => Promise<boolean>;
  respond: (requestId: string, action: 'accept' | 'reject') => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  clear: () => void;
}

const initialState = {
  friends: [] as Friend[],
  incoming: [] as FriendRequest[],
  outgoing: [] as FriendRequest[],
  searchResults: [] as UserSearchResult[],
  hasLoaded: false,
  isLoading: false,
  isSearching: false,
  error: null as string | null,
};

/** Sequência das buscas: só a resposta da última requisição pode escrever. */
let searchSeq = 0;

export const useFriendsStore = create<FriendsState>((set, get) => ({
  ...initialState,

  // R5 (26/11): toda escrita depois de um await confere a sessão; a resposta
  // (ou o rollback) da conta anterior não pode repopular o store da seguinte.
  load: async () => {
    const owner = captureSessionOwner();
    set({ isLoading: true, error: null });
    try {
      const [friends, requests] = await Promise.all([
        friendsService.list(),
        friendsService.requests(),
      ]);
      if (!isCurrentOwner(owner)) return;
      set({
        friends,
        incoming: requests.incoming,
        outgoing: requests.outgoing,
        hasLoaded: true,
        isLoading: false,
      });
    } catch {
      if (!isCurrentOwner(owner)) return;
      set({ isLoading: false, hasLoaded: true, error: 'Não foi possível carregar seus amigos.' });
    }
  },

  search: async (query) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchSeq++; // invalida qualquer busca em voo
      set({ searchResults: [], isSearching: false });
      return;
    }
    // L2: o debounce reduz mas não elimina buscas concorrentes. Sem o token, a
    // resposta de "ana" podia chegar depois da de "anab" e sobrescrever a lista
    // com resultados do termo antigo.
    const seq = ++searchSeq;
    const owner = captureSessionOwner();
    set({ isSearching: true });
    try {
      const searchResults = await friendsService.search(trimmed);
      // Fora de ordem ou de outra conta: descarta.
      if (seq !== searchSeq || !isCurrentOwner(owner)) return;
      set({ searchResults, isSearching: false });
    } catch {
      if (seq !== searchSeq || !isCurrentOwner(owner)) return;
      set({ isSearching: false });
    }
  },

  clearSearch: () => {
    searchSeq++;
    set({ searchResults: [] });
  },

  sendRequest: async (username) => {
    const owner = captureSessionOwner();
    try {
      await friendsService.sendRequest(username);
      if (!isCurrentOwner(owner)) return true;
      // Atualiza o estado do resultado na hora (evita duplo envio).
      set((s) => ({
        searchResults: s.searchResults.map((u) =>
          u.username === username ? { ...u, relationship: 'pending_sent' } : u,
        ),
      }));
      void get().load();
      return true;
    } catch {
      return false;
    }
  },

  respond: async (requestId, action) => {
    // Otimista: remove o pedido da lista; rollback recarregando em erro.
    const owner = captureSessionOwner();
    const prevIncoming = get().incoming;
    set((s) => ({ incoming: s.incoming.filter((r) => r.id !== requestId) }));
    try {
      await friendsService.respondRequest(requestId, action);
      if (isCurrentOwner(owner)) void get().load();
    } catch {
      if (isCurrentOwner(owner)) set({ incoming: prevIncoming });
    }
  },

  removeFriend: async (friendshipId) => {
    const owner = captureSessionOwner();
    const prevFriends = get().friends;
    set((s) => ({ friends: s.friends.filter((f) => f.friendshipId !== friendshipId) }));
    try {
      await friendsService.remove(friendshipId);
    } catch {
      if (isCurrentOwner(owner)) set({ friends: prevFriends });
    }
  },

  clear: () => set({ ...initialState }),
}));
