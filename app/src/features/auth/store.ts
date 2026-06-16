import { create } from 'zustand';
import { useDietStore } from '@features/diet/store';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  pendingAuth: { token: string; user: User } | null;
  setToken: (token: string, user: User) => void;
  setPendingAuth: (token: string, user: User) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  pendingAuth: null,
  setToken: (token, user) =>
    set({ token, user, isAuthenticated: true, pendingAuth: null }),
  setPendingAuth: (token, user) =>
    set({ pendingAuth: { token, user } }),
  clearToken: () => {
    useDietStore.getState().clear();
    set({ token: null, user: null, isAuthenticated: false, pendingAuth: null });
  },
}));
