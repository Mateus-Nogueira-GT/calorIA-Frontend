import { http, HttpResponse } from 'msw';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}
interface AppNotification {
  id: string;
  type: 'like' | 'comment' | 'challenge_invite' | 'challenge_rank';
  actor: PostAuthor;
  message: string;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

const ana: PostAuthor = { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' };
const bruno: PostAuthor = { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' };

let items: AppNotification[] = [
  { id: 'n1', type: 'like', actor: ana, message: 'curtiu seu post', targetId: 'p1', read: false, createdAt: new Date(Date.now() - 600_000).toISOString() },
  { id: 'n2', type: 'comment', actor: bruno, message: 'comentou no seu post', targetId: 'p1', read: false, createdAt: new Date(Date.now() - 5_400_000).toISOString() },
  { id: 'n3', type: 'challenge_rank', actor: ana, message: 'passou você no ranking', targetId: 'ch1', read: true, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const unread = () => items.filter((n) => !n.read).length;

export const notificationsHandlers = [
  http.get('*/notifications', () => HttpResponse.json({ items, unreadCount: unread() })),

  http.post('*/notifications/read', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
    if (body.ids && body.ids.length > 0) {
      items = items.map((n) => (body.ids!.includes(n.id) ? { ...n, read: true } : n));
    } else {
      items = items.map((n) => ({ ...n, read: true }));
    }
    return HttpResponse.json({ unreadCount: unread() });
  }),
];
