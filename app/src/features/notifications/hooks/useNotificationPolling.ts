import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNotificationsStore } from '../store';
import { useAuthStore } from '@features/auth/store';

const POLL_INTERVAL_MS = 45_000;

export function useNotificationPolling(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchNow = () => {
      // load() relança em erro; o polling falha em silêncio (evita unhandled rejection).
      useNotificationsStore.getState().load().catch(() => {});
    };

    fetchNow();
    const interval = setInterval(fetchNow, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchNow();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isAuthenticated]);
}
