import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setToken: (token: string, user: User) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  setToken: (token, user) =>
    set({ token, user, isAuthenticated: true }),
  clearToken: () =>
    set({ token: null, user: null, isAuthenticated: false }),
}));
