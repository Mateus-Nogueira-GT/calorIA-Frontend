import api from './api';
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
};
