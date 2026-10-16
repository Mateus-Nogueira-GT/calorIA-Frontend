import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { kvStorage } from '@shared/services/storage';

export function inviteTokenFromURL(url: string): string | null {
  // Accept only our scheme or the public web route; never put tokens in HTTP query strings.
  const match = /^caloria:\/\/invite\/([A-Za-z0-9_-]{43})$/.exec(url);
  if (match) return match[1];
  try {
    const parsed = new URL(url);
    if (parsed.pathname.replace(/\/$/, '') !== '/convite') return null;
    return /^[A-Za-z0-9_-]{43}$/.test(parsed.hash.slice(1)) ? parsed.hash.slice(1) : null;
  } catch {
    return null;
  }
}
interface InviteState {
  token: string | null;
  hydrated: boolean;
  setToken: (token: string | null) => void;
}
/** Pending link only; account confirmation is always explicit after login or switching accounts. */
export const useInviteStore = create<InviteState>()(
  persist(
    (set) => ({
      token: null,
      hydrated: false,
      setToken: (token) => set({ token }),
    }),
    {
      name: 'caloria:pending-invite',
      storage: createJSONStorage(() => kvStorage),
      partialize: ({ token }) => ({ token }),
      onRehydrateStorage: () => () => useInviteStore.setState({ hydrated: true }),
    },
  ),
);
