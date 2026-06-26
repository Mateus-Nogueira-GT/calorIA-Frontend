import { create } from 'zustand';
import { notificationsService } from '@shared/services/notifications.service';
import type { AppNotification } from '@shared/services/notifications.service';

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;
  isLoading: boolean;

  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  clear: () => void;
}

const initialState = {
  items: [] as AppNotification[],
  unreadCount: 0,
  isLoading: false,
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const res = await notificationsService.getNotifications();
      set({ items: res.items, unreadCount: res.unreadCount, isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  markAllRead: async () => {
    const snapshot = { items: get().items, unreadCount: get().unreadCount };
    if (snapshot.unreadCount === 0) return;
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    try {
      const res = await notificationsService.markRead();
      set({ unreadCount: res.unreadCount });
    } catch {
      set(snapshot);
    }
  },

  markRead: async (id) => {
    const target = get().items.find((n) => n.id === id);
    if (!target || target.read) return;
    const snapshot = { items: get().items, unreadCount: get().unreadCount };
    set((s) => ({
      items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    try {
      const res = await notificationsService.markRead([id]);
      set({ unreadCount: res.unreadCount });
    } catch {
      set(snapshot);
    }
  },

  clear: () => set({ ...initialState }),
}));
