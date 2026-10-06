import api from './api';
import { todayString, tzOffsetMinutes } from '@shared/utils/date';

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

export type TranscribeMimeType = 'audio/m4a' | 'audio/mp4' | 'audio/aac' | 'audio/webm';

// O backend espera o provedor de transcrição até 55 s; o cliente espera um
// pouco mais para receber o erro dele (502/503) em vez de um timeout local.
const TRANSCRIBE_TIMEOUT_MS = 65000;

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
      // date/tzOffsetMinutes locais: o coach monta o contexto do dia correto.
      .post<BackendChatResponse>(
        '/chat/message',
        {
          message: content,
          conversation_id: conversationId,
          date: todayString(),
          tzOffsetMinutes: tzOffsetMinutes(),
        },
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

  /** Áudio em base64 puro (sem prefixo data:) → texto transcrito. */
  transcribe: (audioBase64: string, mimeType: TranscribeMimeType) =>
    api
      .post<{ text: string }>(
        '/chat/transcribe',
        { audio: audioBase64, mimeType },
        { timeout: TRANSCRIBE_TIMEOUT_MS },
      )
      .then((r) => r.data.text),
};
