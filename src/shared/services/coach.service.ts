import api from './api';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SendMessagePayload {
  message: string;
  conversationId?: string;
}

export const coachService = {
  getHistory: (conversationId: string) =>
    api.get<CoachMessage[]>(`/coach/history/${conversationId}`).then((r) => r.data),
  sendMessage: (data: SendMessagePayload) =>
    api.post<CoachMessage>('/coach/message', data).then((r) => r.data),
};
