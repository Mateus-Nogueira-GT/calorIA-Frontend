import axios from 'axios';
import { create } from 'zustand';
import { challengesService } from '@shared/services/challenges.service';
import type {
  Challenge,
  LeaderboardEntry,
  CreateChallengeInput,
} from '@shared/services/challenges.service';
import { showAlert } from '@shared/utils/show-alert';
import { todayString } from '@shared/utils/date';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

interface ChallengesState {
  challenges: Challenge[];
  leaderboardByChallenge: Record<string, LeaderboardEntry[]>;
  isLoading: boolean;
  isCreating: boolean;
  joiningId: string | null;
  checkingInId: string | null;
  loadingLeaderboardId: string | null;

  load: () => Promise<void>;
  create: (input: CreateChallengeInput) => Promise<Challenge>;
  join: (challengeId: string) => Promise<void>;
  checkIn: (challengeId: string) => Promise<boolean>;
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
  checkingInId: null as string | null,
  loadingLeaderboardId: null as string | null,
};

export const useChallengesStore = create<ChallengesState>((set, get) => ({
  ...initialState,

  load: async () => {
    // S10: resposta que chega depois de trocar de conta é da conta anterior.
    const owner = captureSessionOwner();
    set({ isLoading: true });
    try {
      const challenges = await challengesService.getChallenges();
      if (!isCurrentOwner(owner)) return;
      // S5: GET /challenges só lista desafios dos quais sou membro. Substituir a
      // lista apagava o desafio vindo de convite (ainda não aceito) e o card
      // "Participar" sumia. Merge no momento da resposta: mantém os convites.
      set((s) => {
        const fetched = new Set(challenges.map((c) => c.id));
        const pendingInvites = s.challenges.filter((c) => !c.joinedByMe && !fetched.has(c.id));
        return { challenges: [...pendingInvites, ...challenges], isLoading: false };
      });
    } catch (e) {
      if (!isCurrentOwner(owner)) return;
      set({ isLoading: false });
      throw e;
    }
  },

  // R5 (26/11): as demais ações também conferem a sessão depois do await —
  // a resposta (ou o rollback) da conta anterior não escreve no store da seguinte.
  create: async (input) => {
    const owner = captureSessionOwner();
    set({ isCreating: true });
    try {
      const created = await challengesService.create(input);
      if (!isCurrentOwner(owner)) return created;
      set((s) => ({ challenges: [created, ...s.challenges], isCreating: false }));
      return created;
    } catch (e) {
      if (!isCurrentOwner(owner)) throw e;
      set({ isCreating: false });
      showAlert('Não foi possível criar o desafio', 'Tente novamente.');
      throw e;
    }
  },

  join: async (challengeId) => {
    const target = get().challenges.find((c) => c.id === challengeId);
    if (!target || target.joinedByMe) return;
    const owner = captureSessionOwner();
    const snapshot = { joinedByMe: target.joinedByMe, participantCount: target.participantCount };
    set((s) => ({
      joiningId: challengeId,
      challenges: s.challenges.map((c) =>
        c.id === challengeId ? { ...c, joinedByMe: true, participantCount: c.participantCount + 1 } : c,
      ),
    }));
    try {
      const updated = await challengesService.join(challengeId);
      if (!isCurrentOwner(owner)) return;
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? updated : c)),
      }));
    } catch (e) {
      if (!isCurrentOwner(owner)) return;
      set((s) => ({
        joiningId: null,
        challenges: s.challenges.map((c) => (c.id === challengeId ? { ...c, ...snapshot } : c)),
      }));
      showAlert('Não foi possível entrar no desafio', 'Tente novamente.');
      throw e;
    }
  },

  // Check-in diário (a UI nunca tinha exposto isso — o ranking ficava sempre
  // zerado). Recarrega o leaderboard do desafio após o sucesso.
  checkIn: async (challengeId) => {
    // B3: sem essa trava, dois toques rápidos disparavam dois check-ins; o
    // segundo zerava a sequência no servidor.
    if (get().checkingInId) return false;
    const owner = captureSessionOwner();
    set({ checkingInId: challengeId });
    // O botão vira "✅ Check-in feito" na hora: antes nada mudava na tela e
    // parecia que o toque não tinha funcionado.
    const markDoneToday = () =>
      set((s) => ({
        challenges: s.challenges.map((c) =>
          c.id === challengeId ? { ...c, myLastCheckIn: todayString() } : c,
        ),
      }));
    try {
      await challengesService.checkIn(challengeId);
      if (!isCurrentOwner(owner)) return true;
      markDoneToday();
      void get().loadLeaderboard(challengeId).catch(() => {});
      return true;
    } catch (e) {
      if (!isCurrentOwner(owner)) return false;
      const status = (e as { response?: { status?: number; data?: { error?: string } } })
        .response;
      if (status?.data?.error === 'ALREADY_CHECKED_IN') {
        markDoneToday();
        showAlert('Tudo certo por hoje', 'Você já fez o check-in de hoje neste desafio.');
      } else if (status?.data?.error === 'CHALLENGE_ENDED') {
        showAlert('Desafio encerrado', 'Este desafio já chegou ao fim.');
      } else {
        showAlert('Não foi possível fazer o check-in', 'Tente novamente.');
      }
      return false;
    } finally {
      set({ checkingInId: null });
    }
  },

  loadLeaderboard: async (challengeId) => {
    const owner = captureSessionOwner();
    set({ loadingLeaderboardId: challengeId });
    try {
      const entries = await challengesService.getLeaderboard(challengeId);
      if (!isCurrentOwner(owner)) return;
      set((s) => ({
        loadingLeaderboardId: null,
        leaderboardByChallenge: { ...s.leaderboardByChallenge, [challengeId]: entries },
      }));
    } catch (e) {
      if (!isCurrentOwner(owner)) return;
      set({ loadingLeaderboardId: null });
      throw e;
    }
  },

  resolveInvite: async (code) => {
    const owner = captureSessionOwner();
    const challenge = await challengesService.resolveInvite(code);
    if (!isCurrentOwner(owner)) throw new axios.CanceledError();
    set((s) => ({
      challenges: s.challenges.some((c) => c.id === challenge.id)
        ? s.challenges.map((c) => (c.id === challenge.id ? challenge : c))
        : [challenge, ...s.challenges],
    }));
    return challenge;
  },

  clear: () => set({ ...initialState }),
}));
