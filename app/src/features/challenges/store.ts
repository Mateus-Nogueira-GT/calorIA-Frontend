import { Alert } from 'react-native';
import { create } from 'zustand';
import { challengesService } from '@shared/services/challenges.service';
import type {
  Challenge,
  LeaderboardEntry,
  CreateChallengeInput,
} from '@shared/services/challenges.service';

interface ChallengesState {
  challenges: Challenge[];
  leaderboardByChallenge: Record<string, LeaderboardEntry[]>;
  isLoading: boolean;
  isCreating: boolean;
  joiningId: string | null;
  loadingLeaderboardId: string | null;

  load: () => Promise<void>;
  create: (input: CreateChallengeInput) => Promise<Challenge>;
  join: (challengeId: string) => Promise<void>;
  loadLeaderboard: (challengeId: string) => Promise<void>;
  resolveInvite: (code: string) => Promise<Challenge>;
  clear: () => void;
}

const initialState = {
  challenges: [] as Challenge[],
  leaderboardByChallenge: {} as Record<string, LeaderboardEntry[]>,
  isLoading: false,
  isCreating: false,
  joiningId: null as string | null,
  loadingLeaderboardId: null as string | null,
};

export const useChallengesStore = create<ChallengesState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const challenges = await challengesService.getChallenges();
      set({ challenges, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  create: async (input) => {
    set({ isCreating: true });
    try {
      const created = await challengesService.create(input);
      set((s) => ({ challenges: [created, ...s.challenges], isCreating: false }));
      return created;
    } catch (e) {
      set({ isCreating: false });
      Alert.alert('Não foi possível criar o desafio', 'Tente novamente.');
      throw e;
    }
  },

  join: async (challengeId) => {
    const target = get().challenges.find((c) => c.id === challengeId);
    if (!target || target.joinedByMe) return;
    const snapshot = { joinedByMe: target.joinedByMe, participantCount: target.participantCount };
    set((s) => ({
      joiningId: challengeId,
      challenges: s.challenges.map((c) =>
        c.id === challengeId ? { ...c, joinedByMe: true, participantCount: c.participantCount + 1 } : c,
      ),
    }));
    try {
      const updated = await challengesService.join(challengeId);
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? updated : c)),
      }));
    } catch (e) {
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? { ...c, ...snapshot } : c)),
      }));
      Alert.alert('Não foi possível entrar no desafio', 'Tente novamente.');
      throw e;
    }
  },

  loadLeaderboard: async (challengeId) => {
    set({ loadingLeaderboardId: challengeId });
    try {
      const entries = await challengesService.getLeaderboard(challengeId);
      set((s) => ({
        loadingLeaderboardId: null,
        leaderboardByChallenge: { ...s.leaderboardByChallenge, [challengeId]: entries },
      }));
    } catch (e) {
      set({ loadingLeaderboardId: null });
      throw e;
    }
  },

  resolveInvite: async (code) => {
    const challenge = await challengesService.resolveInvite(code);
    set((s) => ({
      challenges: s.challenges.some((c) => c.id === challenge.id)
        ? s.challenges.map((c) => (c.id === challenge.id ? challenge : c))
        : [challenge, ...s.challenges],
    }));
    return challenge;
  },

  clear: () => set({ ...initialState }),
}));
