import api from './api';

export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
  dietGenerated?: boolean;
  dietId?: string | null;
  dietJobId?: string | null;
}

export interface HistoryResult {
  messages: CoachMessage[];
  status: string;
}

interface BackendHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BackendChatResponse {
  conversation_id: string;
  message: { role: 'assistant'; content: string; created_at: string };
  diet_generated: boolean;
  diet_id: string | null;
  diet_job_id: string | null;
}

function toCoachRole(role: 'user' | 'assistant'): 'coach' | 'user' {
  return role === 'assistant' ? 'coach' : 'user';
}

export const coachService = {
  getHistory: (conversationId: string) =>
    api
      .get<{ messages: BackendHistoryMessage[]; status: string }>(`/chat/history/${conversationId}`)
      .then((r) => ({
        status: r.data.status,
        messages: r.data.messages.map((m, i) => ({
          id: `${conversationId}-${i}`,
          role: toCoachRole(m.role),
          content: m.content,
          timestamp: new Date().toISOString(),
        })),
      })),

  sendMessage: (content: string, conversationId: string | null) =>
    api
      // Chat com IA pode levar mais que os 10s padrão do axios.
      .post<BackendChatResponse>(
        '/chat/message',
        { message: content, conversation_id: conversationId },
        { timeout: 60000 },
      )
      .then((r) => ({
        conversationId: r.data.conversation_id,
        message: {
          id: `${r.data.conversation_id}-${Date.now()}`,
          role: 'coach' as const,
          content: r.data.message.content,
          timestamp: r.data.message.created_at,
          dietGenerated: r.data.diet_generated,
          dietId: r.data.diet_id,
          dietJobId: r.data.diet_job_id,
        },
      })),
};
