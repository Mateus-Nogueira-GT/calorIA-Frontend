import axios, { type AxiosRequestConfig } from 'axios';
import api from './api';
import { notifyCreditChange } from './credits.service';
import { beginRequest, finishRequest, isDefinitiveRejection } from './operation-requests';
import { bindRequestToOwner, captureSessionOwner, isCurrentOwner } from './session-owner';
import { todayString, tzOffsetMinutes } from '@shared/utils/date';

/** Guard and cancellation for one voice operation; text callers omit it. */
export interface VoiceRequestContext {
  signal: AbortSignal;
  isValid: () => boolean;
}

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
// O backend espera o provedor de voz até 30 s.
const SPEECH_TIMEOUT_MS = 40000;

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

  sendMessage: async (
    content: string,
    conversationId: string | null,
    voice?: VoiceRequestContext,
  ) => {
    if (voice && (!voice.isValid() || voice.signal.aborted)) {
      return Promise.reject(new axios.CanceledError());
    }
    const owner = captureSessionOwner();
    const userId = owner.userId;
    const request = await beginRequest('chat', JSON.stringify([conversationId, content]), {
      date: todayString(),
      tzOffsetMinutes: tzOffsetMinutes(),
    });
    if (!isCurrentOwner(owner) || (voice && (!voice.isValid() || voice.signal.aborted)))
      throw new axios.CanceledError();
    const cancelPending = () => {
      if (!isCurrentOwner(owner)) return;
      const cancellation = bindRequestToOwner(owner);
      void api
        .post<{ state: string }>(
          `/credits/operations/by-key/${encodeURIComponent(request.key)}/cancel`,
          {},
          cancellation.config,
        )
        .then(async ({ data }) => {
          if (data.state === 'cancelled') await finishRequest(request, userId);
          if (isCurrentOwner(owner)) notifyCreditChange();
        })
        .catch(() => {
          /* Fenced server recovery remains available if cancellation fails. */
        })
        .finally(cancellation.release);
    };
    const binding = bindRequestToOwner(owner, voice?.signal);
    voice?.signal.addEventListener('abort', cancelPending, { once: true });
    return (
      api
        // Chat com IA pode levar mais que os 10s padrão do axios.
        // date/tzOffsetMinutes locais: o coach monta o contexto do dia correto.
        .post<BackendChatResponse>(
          '/chat/message',
          {
            message: content,
            conversation_id: conversationId,
            date: request.date,
            tzOffsetMinutes: request.tzOffsetMinutes,
          },
          {
            timeout: 60000,
            headers: { 'Idempotency-Key': request.key },
            ...binding.config,
          },
        )
        .then((r) => {
          if (!isCurrentOwner(owner)) throw new axios.CanceledError();
          notifyCreditChange();
          return {
            conversationId: r.data.conversation_id,
            acknowledge: () => finishRequest(request, userId),
            message: {
              id: `${r.data.conversation_id}-${Date.now()}`,
              role: 'coach' as const,
              content: r.data.message.content,
              timestamp: r.data.message.created_at,
              dietGenerated: r.data.diet_generated,
              dietId: r.data.diet_id,
              dietJobId: r.data.diet_job_id,
            },
          };
        })
        .catch(async (error: unknown) => {
          if (isDefinitiveRejection(error)) await finishRequest(request, userId);
          throw error;
        })
        .finally(() => {
          voice?.signal.removeEventListener('abort', cancelPending);
          binding.release();
        })
    );
  },

  /**
   * Última resposta do Coach em áudio (MP3 base64). O texto vem do histórico
   * no servidor; `config` leva a vinculação ao dono da sessão.
   */
  speak: (conversationId: string, config?: AxiosRequestConfig) =>
    api
      .post<{ audio: string; mimeType: 'audio/mpeg' }>(
        '/chat/speech',
        { conversation_id: conversationId },
        { timeout: SPEECH_TIMEOUT_MS, ...config },
      )
      .then((r) => r.data),

  /** Áudio em base64 puro (sem prefixo data:) → texto transcrito. */
  transcribe: (audioBase64: string, mimeType: TranscribeMimeType, signal?: AbortSignal) =>
    api
      .post<{ text: string }>(
        '/chat/transcribe',
        { audio: audioBase64, mimeType },
        { timeout: TRANSCRIBE_TIMEOUT_MS, ...(signal ? { signal } : {}) },
      )
      .then((r) => r.data.text),
};
