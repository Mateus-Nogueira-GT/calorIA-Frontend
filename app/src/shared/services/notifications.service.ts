import api from './api';
import type { PostAuthor } from './feed.service';

export type NotificationType = 'like' | 'comment' | 'challenge_invite' | 'challenge_rank';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor: PostAuthor;
  message: string;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
}

export const notificationsService = {
  getNotifications: () =>
    api.get<NotificationsResponse>('/notifications').then((r) => r.data),
  markRead: (ids?: string[]) =>
    api.post<{ unreadCount: number }>('/notifications/read', { ids }).then((r) => r.data),
};
