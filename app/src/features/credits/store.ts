import { create } from 'zustand';
import { creditsService, Wallet, subscribeCreditChange } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';

interface CreditsState {
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  clear: () => void;
}
let requestVersion = 0;
export const useCreditsStore = create<CreditsState>((set) => ({
  wallet: null,
  loading: false,
  error: null,
  clear: () => {
    requestVersion++;
    set({ wallet: null, loading: false, error: null });
  },
  load: async () => {
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated) return;
    const version = ++requestVersion;
    const isCurrent = () =>
      version === requestVersion &&
      auth.sessionGeneration === useAuthStore.getState().sessionGeneration &&
      auth.user?.id === useAuthStore.getState().user?.id;
    set({ loading: true, error: null });
    try {
      const wallet = await creditsService.wallet();
      if (isCurrent()) set({ wallet, loading: false });
    } catch {
      if (isCurrent())
        set({ wallet: null, loading: false, error: 'Não foi possível consultar seu saldo.' });
    }
  },
}));
useAuthStore.subscribe((state, previous) => {
  if (state.sessionGeneration !== previous.sessionGeneration) useCreditsStore.getState().clear();
});

subscribeCreditChange(() => {
  void useCreditsStore.getState().load();
});
