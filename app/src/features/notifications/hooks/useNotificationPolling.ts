import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNotificationsStore } from '../store';
import { useAuthStore } from '@features/auth/store';

const POLL_INTERVAL_MS = 45_000;

export function useNotificationPolling(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchNow = () => {
      // load() relança em erro; o polling falha em silêncio (evita unhandled rejection).
      useNotificationsStore.getState().load().catch(() => {});
    };

    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const start = () => {
      fetchNow();
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchNow, POLL_INTERVAL_MS);
      }
    };

    start();

    // O timer seguia disparando rede em background até o SO matar o processo
    // (bateria/dados no Android). Agora para ao sair de 'active' e religa ao
    // voltar, mantendo o refetch imediato de foreground.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [isAuthenticated]);
}
