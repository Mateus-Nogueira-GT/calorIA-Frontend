import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { kvStorage } from '@shared/services/storage';
import { useDietStore } from '@features/diet/store';
import { useFoodLogStore } from '@features/food-log/store';
import { useScannerStore } from '@features/scanner/store';
import { useWeightStore } from '@features/evolution/store';
import { useFeedStore } from '@features/feed/store';
import { useChallengesStore } from '@features/challenges/store';
import { useNotificationsStore } from '@features/notifications/store';
import { useFriendsStore } from '@features/friends/store';

interface User {
  id: string;
  name: string;
  email: string;
  goal?: string | null;
  coachPersonality?: CoachPersonalityPreference | null;
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
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
  /**
   * Preferências por usuário, persistidas junto com a sessão (kvStorage).
   * Antes viviam em window.localStorage — inexistente no React Native, então
   * no mobile as escolhas de onboarding sumiam a cada restart.
   */
  preferencesByUser: Record<string, ProfilePreferences>;
  /** true depois que o persist terminou de reidratar do storage (boot). */
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setToken: (token: string, user: User, refreshToken?: string) => void;
  setPendingAuth: (token: string, user: User, refreshToken: string) => void;
  setProfilePreferences: (preferences: Partial<ProfilePreferences>) => void;
  updateUser: (patch: Partial<Pick<User, 'name' | 'avatarUrl' | 'avatarEmoji'>>) => void;
  clearToken: () => void;
}

const PROFILE_PREFERENCES_STORAGE_KEY = 'caloria:profile-preferences';

function isGoalPreference(value: string | null | undefined): value is GoalPreference {
  return (
    value === 'lose_weight' || value === 'gain_muscle' || value === 'maintain' || value === 'health'
  );
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

/**
 * Migração única do formato legado (web): as preferências ficavam numa chave
 * própria do localStorage. Lemos uma vez na hidratação e passamos a manter
 * tudo no estado persistido (que funciona também no nativo).
 */
function readLegacyPreferences(): Record<string, ProfilePreferences> {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
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

function getProfilePreferencesFromUser(user: User): ProfilePreferences {
  return {
    goal: isGoalPreference(user.goal) ? user.goal : null,
    coachPersonality: isCoachPersonalityPreference(user.coachPersonality)
      ? user.coachPersonality
      : null,
  };
}

/** O que vem do backend (user) tem prioridade sobre o que está salvo localmente. */
function mergeProfilePreferences(
  user: User,
  stored: ProfilePreferences | undefined,
): ProfilePreferences {
  const fromUser = getProfilePreferencesFromUser(user);

  return {
    goal: fromUser.goal ?? stored?.goal ?? null,
    coachPersonality: fromUser.coachPersonality ?? stored?.coachPersonality ?? null,
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      pendingAuth: null,
      profilePreferences: {
        goal: null,
        coachPersonality: null,
      },
      preferencesByUser: {},
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setToken: (token, user, refreshToken) =>
        set((state) => {
          const profilePreferences = mergeProfilePreferences(
            user,
            state.preferencesByUser[user.id],
          );

          return {
            token,
            refreshToken: refreshToken ?? state.pendingAuth?.refreshToken ?? state.refreshToken,
            user,
            isAuthenticated: true,
            pendingAuth: null,
            profilePreferences,
            preferencesByUser: { ...state.preferencesByUser, [user.id]: profilePreferences },
          };
        }),
      setPendingAuth: (token, user, refreshToken) =>
        set((state) => {
          const profilePreferences = mergeProfilePreferences(
            user,
            state.preferencesByUser[user.id],
          );

          return {
            pendingAuth: { token, refreshToken, user },
            profilePreferences,
            preferencesByUser: { ...state.preferencesByUser, [user.id]: profilePreferences },
          };
        }),
      setProfilePreferences: (preferences) =>
        set((state) => {
          const nextPreferences = { ...state.profilePreferences, ...preferences };
          const userId = state.user?.id ?? state.pendingAuth?.user.id;

          return {
            profilePreferences: nextPreferences,
            ...(userId
              ? { preferencesByUser: { ...state.preferencesByUser, [userId]: nextPreferences } }
              : {}),
          };
        }),
      updateUser: (patch) =>
        set((state) => {
          if (!state.user) return {};
          // Ignora chaves undefined (não sobrescreve dados existentes); null é mantido (limpa o campo).
          const clean = Object.fromEntries(
            Object.entries(patch).filter(([, value]) => value !== undefined),
          );
          return { user: { ...state.user, ...clean } };
        }),
      clearToken: () => {
        useDietStore.getState().clear();
        useFoodLogStore.getState().clear();
        useScannerStore.getState().clear();
        useWeightStore.getState().clear();
        useFeedStore.getState().clear();
        useChallengesStore.getState().clear();
        useNotificationsStore.getState().clear();
        useFriendsStore.getState().clear();
        clearPreviewQueryOnWeb();
        // preferencesByUser NÃO é limpo: é o que faz as escolhas de onboarding
        // sobreviverem ao logout e ao restart do app.
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
    }),
    {
      name: 'caloria:auth',
      storage: createJSONStorage(() => kvStorage),
      // Sessão + preferências por usuário; pendingAuth é transitório do onboarding.
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        preferencesByUser: state.preferencesByUser,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Importa uma única vez o que ficou no formato legado (web).
          const legacy = readLegacyPreferences();
          if (Object.keys(legacy).length > 0) {
            state.preferencesByUser = { ...legacy, ...state.preferencesByUser };
          }
          state.setHasHydrated(true);
        }
      },
    },
  ),
);
