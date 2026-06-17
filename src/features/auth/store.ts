import { create } from 'zustand';
import { useDietStore } from '@features/diet/store';
import { useFoodLogStore } from '@features/food-log/store';

interface User {
  id: string;
  name: string;
  email: string;
}

export type GoalPreference = 'lose_weight' | 'gain_muscle' | 'maintain' | 'health';
export type CoachPersonalityPreference = 'motivational' | 'direct' | 'empathetic' | 'scientific';

interface ProfilePreferences {
  goal: GoalPreference | null;
  coachPersonality: CoachPersonalityPreference | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  pendingAuth: { token: string; user: User } | null;
  profilePreferences: ProfilePreferences;
  setToken: (token: string, user: User) => void;
  setPendingAuth: (token: string, user: User) => void;
  setProfilePreferences: (preferences: Partial<ProfilePreferences>) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  pendingAuth: null,
  profilePreferences: {
    goal: null,
    coachPersonality: null,
  },
  setToken: (token, user) =>
    set({ token, user, isAuthenticated: true, pendingAuth: null }),
  setPendingAuth: (token, user) =>
    set({ pendingAuth: { token, user } }),
  setProfilePreferences: (preferences) =>
    set((state) => ({
      profilePreferences: {
        ...state.profilePreferences,
        ...preferences,
      },
    })),
  clearToken: () => {
    useDietStore.getState().clear();
    useFoodLogStore.getState().clear();
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      pendingAuth: null,
      profilePreferences: {
        goal: null,
        coachPersonality: null,
      },
    });
  },
}));
