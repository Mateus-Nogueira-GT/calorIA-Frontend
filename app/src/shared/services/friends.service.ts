import api from './api';

export type FriendRelationship = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export interface FriendUser {
  id: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface Friend extends FriendUser {
  friendshipId: string;
  currentStreak: number | null;
}

export interface FriendRequest {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  user: FriendUser;
}

export interface UserSearchResult extends FriendUser {
  relationship: FriendRelationship;
}

// ─── Mapeamento snake_case (backend) -> camelCase (app) ─────────────────────────

interface DbProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

function toUser(p: DbProfile): FriendUser {
  return { id: p.id, username: p.username, name: p.full_name, avatarUrl: p.avatar_url };
}

interface DbFriend extends DbProfile {
  friendship_id: string;
  current_streak: number | null;
}

interface DbRequest {
  id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  user: DbProfile;
}

interface DbSearchResult extends DbProfile {
  relationship: FriendRelationship;
}

export const friendsService = {
  list: () =>
    api.get<DbFriend[]>('/friends').then((r) =>
      r.data.map((f) => ({ ...toUser(f), friendshipId: f.friendship_id, currentStreak: f.current_streak })),
    ),

  requests: () =>
    api
      .get<{ incoming: DbRequest[]; outgoing: DbRequest[] }>('/friends/requests')
      .then((r) => ({
        incoming: r.data.incoming.map(toRequest),
        outgoing: r.data.outgoing.map(toRequest),
      })),

  search: (query: string) =>
    api
      .get<DbSearchResult[]>('/friends/search', { params: { query } })
      .then((r) => r.data.map((u) => ({ ...toUser(u), relationship: u.relationship }))),

  sendRequest: (username: string) =>
    api.post<{ id: string }>('/friends/requests', { username }).then((r) => r.data),

  respondRequest: (requestId: string, action: 'accept' | 'reject') =>
    api
      .patch<{ status: string }>(`/friends/requests/${requestId}`, { action })
      .then((r) => r.data),

  remove: (friendshipId: string) => api.delete(`/friends/${friendshipId}`).then((r) => r.data),
};

function toRequest(r: DbRequest): FriendRequest {
  return { id: r.id, status: r.status, createdAt: r.created_at, user: toUser(r.user) };
}
