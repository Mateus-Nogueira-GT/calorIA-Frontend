import api from './api';

export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
}

export const coachService = {
  getHistory: () =>
    api.get<CoachMessage[]>('/coach/history').then((r) => r.data),

  sendMessage: (content: string) =>
    api.post<CoachMessage>('/coach/message', { content }).then((r) => r.data),
};
