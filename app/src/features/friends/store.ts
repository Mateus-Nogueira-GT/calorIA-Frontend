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
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const searchResults = await friendsService.search(trimmed);
      set({ searchResults, isSearching: false });
    } catch {
      set({ isSearching: false });
    }
  },

  clearSearch: () => set({ searchResults: [] }),

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
