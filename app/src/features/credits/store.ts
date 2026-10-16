import { create } from 'zustand';
import { creditsService, Wallet, subscribeCreditChange } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';

interface CreditsState {
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  /**
   * Créditos ou convites já vieram ativos nesta sessão. Sobrevive a uma falha
   * de consulta (o saldo vira null, sem inventar zero), para o app saber se o
   * aviso "Saldo indisponível" faz sentido para esta conta.
   */
  featureVisible: boolean;
  load: () => Promise<void>;
  clear: () => void;
}
let requestVersion = 0;
export const useCreditsStore = create<CreditsState>((set) => ({
  wallet: null,
  loading: false,
  error: null,
  featureVisible: false,
  clear: () => {
    requestVersion++;
    set({ wallet: null, loading: false, error: null, featureVisible: false });
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
      if (isCurrent())
        set({
          wallet,
          loading: false,
          featureVisible: wallet.enforcement_enabled || wallet.invites_enabled,
        });
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
