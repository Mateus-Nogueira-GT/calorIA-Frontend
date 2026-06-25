import { create } from 'zustand';
import { useDietStore } from '@features/diet/store';
import { useFoodLogStore } from '@features/food-log/store';
import { useFeedStore } from '@features/feed/store';
import { useChallengesStore } from '@features/challenges/store';
import { useNotificationsStore } from '@features/notifications/store';

interface User {
  id: string;
  name: string;
  email: string;
  goal?: string | null;
  coachPersonality?: CoachPersonalityPreference | null;
}

export type GoalPreference = 'lose_weight' | 'gain_muscle' | 'maintain' | 'health';
export type CoachPersonalityPreference = 'motivational' | 'direct' | 'empathetic' | 'scientific';

interface ProfilePreferences {
  goal: GoalPreference | null;
  coachPersonality: CoachPersonalityPreference | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  pendingAuth: { token: string; refreshToken: string; user: User } | null;
  profilePreferences: ProfilePreferences;
  setToken: (token: string, user: User, refreshToken?: string) => void;
  setPendingAuth: (token: string, user: User, refreshToken: string) => void;
  setProfilePreferences: (preferences: Partial<ProfilePreferences>) => void;
  clearToken: () => void;
}

const PROFILE_PREFERENCES_STORAGE_KEY = 'caloria:profile-preferences';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isGoalPreference(value: string | null | undefined): value is GoalPreference {
  return value === 'lose_weight' || value === 'gain_muscle' || value === 'maintain' || value === 'health';
}

function isCoachPersonalityPreference(
  value: string | null | undefined,
): value is CoachPersonalityPreference {
  return (
    value === 'motivational' ||
    value === 'direct' ||
    value === 'empathetic' ||
    value === 'scientific'
  );
}

function readStoredPreferencesByUser(): Record<string, ProfilePreferences> {
  if (!canUseLocalStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(PROFILE_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, ProfilePreferences>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredPreferencesByUser(value: Record<string, ProfilePreferences>): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(PROFILE_PREFERENCES_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage write failures and keep the in-memory session usable.
  }
}

function getStoredPreferencesForUser(userId: string): ProfilePreferences {
  return readStoredPreferencesByUser()[userId] ?? { goal: null, coachPersonality: null };
}

function persistPreferencesForUser(userId: string, preferences: ProfilePreferences): void {
  const next = {
    ...readStoredPreferencesByUser(),
    [userId]: preferences,
  };
  writeStoredPreferencesByUser(next);
}

function getProfilePreferencesFromUser(user: User): ProfilePreferences {
  return {
    goal: isGoalPreference(user.goal) ? user.goal : null,
    coachPersonality: isCoachPersonalityPreference(user.coachPersonality)
      ? user.coachPersonality
      : null,
  };
}

function mergeProfilePreferences(user: User): ProfilePreferences {
  const fromUser = getProfilePreferencesFromUser(user);
  const fromStorage = getStoredPreferencesForUser(user.id);

  return {
    goal: fromUser.goal ?? fromStorage.goal,
    coachPersonality: fromUser.coachPersonality ?? fromStorage.coachPersonality,
  };
}

function clearPreviewQueryOnWeb(): void {
  if (typeof window === 'undefined' || typeof window.location?.href !== 'string') {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get('preview') !== 'app') {
    return;
  }

  url.searchParams.delete('preview');
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  pendingAuth: null,
  profilePreferences: {
    goal: null,
    coachPersonality: null,
  },
  setToken: (token, user, refreshToken) =>
    set((state) => {
      const profilePreferences = mergeProfilePreferences(user);
      persistPreferencesForUser(user.id, profilePreferences);

      return {
        token,
        refreshToken: refreshToken ?? state.pendingAuth?.refreshToken ?? state.refreshToken,
        user,
        isAuthenticated: true,
        pendingAuth: null,
        profilePreferences,
      };
    }),
  setPendingAuth: (token, user, refreshToken) =>
    set(() => {
      const profilePreferences = mergeProfilePreferences(user);
      persistPreferencesForUser(user.id, profilePreferences);

      return {
        pendingAuth: { token, refreshToken, user },
        profilePreferences,
      };
    }),
  setProfilePreferences: (preferences) =>
    set((state) => ({
      ...(state.user?.id || state.pendingAuth?.user.id
        ? (() => {
            const nextPreferences = {
              ...state.profilePreferences,
              ...preferences,
            };
            persistPreferencesForUser(state.user?.id ?? state.pendingAuth!.user.id, nextPreferences);
            return {
              profilePreferences: nextPreferences,
            };
          })()
        : {
            profilePreferences: {
              ...state.profilePreferences,
              ...preferences,
            },
          }),
    })),
  clearToken: () => {
    useDietStore.getState().clear();
    useFoodLogStore.getState().clear();
    useFeedStore.getState().clear();
    useChallengesStore.getState().clear();
    useNotificationsStore.getState().clear();
    clearPreviewQueryOnWeb();
    set({
      token: null,
      refreshToken: null,
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
