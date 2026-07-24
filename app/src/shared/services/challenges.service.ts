import api from './api';
import { todayString } from '@shared/utils/date';
import type { PostAuthor } from './feed.service';

export type ChallengeMetric = 'streak';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  participantCount: number;
  metric: ChallengeMetric;
  joinedByMe: boolean;
  inviteCode: string;
  /** Derivado da data-fim no backend (F3) — separa ativos de encerrados. */
  finished: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  user: PostAuthor;
  streak: number;
  isMe: boolean;
}

export interface CreateChallengeInput {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
}

export interface ChallengeMember {
  id: string;
  user_id: string;
  status: string;
  current_streak: number;
  best_streak: number;
  total_days: number;
  last_check_in: string | null;
}

export const challengesService = {
  getChallenges: () => api.get<Challenge[]>('/challenges').then((r) => r.data),
  create: (input: CreateChallengeInput) =>
    api.post<Challenge>('/challenges', input).then((r) => r.data),
  join: (id: string) =>
    api.post<Challenge>(`/challenges/${id}/join`).then((r) => r.data),
  getLeaderboard: (id: string) =>
    api.get<LeaderboardEntry[]>(`/challenges/${id}/leaderboard`).then((r) => r.data),
  resolveInvite: (code: string) =>
    api.get<Challenge>(`/challenges/invite/${code}`).then((r) => r.data),
  /** Check-in diário — envia a data LOCAL (o servidor em UTC erraria o dia à noite). */
  checkIn: (id: string) =>
    api
      .post<ChallengeMember>(`/challenges/${id}/checkin`, { date: todayString() })
      .then((r) => r.data),
};
