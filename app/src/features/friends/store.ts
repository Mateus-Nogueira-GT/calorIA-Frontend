import { create } from 'zustand';
import {
  friendsService,
  Friend,
  FriendRequest,
  UserSearchResult,
} from '@shared/services/friends.service';

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

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const [friends, requests] = await Promise.all([
        friendsService.list(),
        friendsService.requests(),
      ]);
      set({
        friends,
        incoming: requests.incoming,
        outgoing: requests.outgoing,
        hasLoaded: true,
        isLoading: false,
      });
    } catch {
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
    set({ isSearching: true });
    try {
      const searchResults = await friendsService.search(trimmed);
      if (seq !== searchSeq) return; // chegou fora de ordem: descarta
      set({ searchResults, isSearching: false });
    } catch {
      if (seq !== searchSeq) return;
      set({ isSearching: false });
    }
  },

  clearSearch: () => {
    searchSeq++;
    set({ searchResults: [] });
  },

  sendRequest: async (username) => {
    try {
      await friendsService.sendRequest(username);
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
    const prevIncoming = get().incoming;
    set((s) => ({ incoming: s.incoming.filter((r) => r.id !== requestId) }));
    try {
      await friendsService.respondRequest(requestId, action);
      void get().load();
    } catch {
      set({ incoming: prevIncoming });
    }
  },

  removeFriend: async (friendshipId) => {
    const prevFriends = get().friends;
    set((s) => ({ friends: s.friends.filter((f) => f.friendshipId !== friendshipId) }));
    try {
      await friendsService.remove(friendshipId);
    } catch {
      set({ friends: prevFriends });
    }
  },

  clear: () => set({ ...initialState }),
}));
