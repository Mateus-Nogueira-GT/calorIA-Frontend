import axios from 'axios';
import api from './api';
import { notifyCreditChange } from './credits.service';
import {
  beginRequest,
  finishRequest,
  isDefinitiveRejection,
  requestSessionMatches,
} from './operation-requests';
import { useAuthStore } from '@features/auth/store';

export interface ScanItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Fibra (g). null/ausente = sem dado. */
  fiber?: number | null;
  confidence: number;
  uncertain?: boolean;
}

export interface ScanResponse {
  items: ScanItem[];
}

let fallbackSeq = 0;

/**
 * Normaliza a resposta do backend para { items }. O contrato canônico é
 * { items: ScanItem[] }, mas mantemos tolerância a um item único legado.
 */
function normalize(data: unknown): ScanResponse {
  const d = data as ({ items?: ScanItem[] } & Partial<ScanItem>) | null;
  if (d && Array.isArray(d.items)) {
    return { items: d.items.map((it, i) => ({ ...it, id: it.id ?? `scan-${i}` })) };
  }
  if (d && typeof d.name === 'string') {
    return {
      items: [
        {
          id: d.id ?? `scan-${fallbackSeq++}`,
          name: d.name,
          calories: d.calories ?? 0,
          protein: d.protein ?? 0,
          carbs: d.carbs ?? 0,
          fat: d.fat ?? 0,
          fiber: d.fiber ?? null,
          confidence: d.confidence ?? 1,
        },
      ],
    };
  }
  return { items: [] };
}

export const scannerService = {
  /** Envia a imagem como data URL base64 para análise via IA Vision. */
  analyzePhoto: async (image: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new axios.CanceledError();
    const { user, sessionGeneration } = useAuthStore.getState();
    const userId = user?.id;
    const request = await beginRequest('photo', image);
    if (!requestSessionMatches(userId, sessionGeneration) || signal?.aborted)
      throw new axios.CanceledError();
    const cancelPending = () => {
      if (!requestSessionMatches(userId, sessionGeneration)) return;
      void api
        .post<{ state: string }>(
          `/credits/operations/by-key/${encodeURIComponent(request.key)}/cancel`,
          {},
        )
        .then(async ({ data }) => {
          if (data.state === 'cancelled') await finishRequest(request, userId);
          if (requestSessionMatches(userId, sessionGeneration)) notifyCreditChange();
        })
        .catch(() => {
          /* Recover by operation key when server cancellation is uncertain. */
        });
    };
    signal?.addEventListener('abort', cancelPending, { once: true });
    try {
      const response = await api.post<unknown>(
        '/scanner/analyze',
        { image },
        {
          timeout: 75000,
          headers: { 'Idempotency-Key': request.key },
          ...(signal ? { signal } : {}),
        },
      );
      await finishRequest(request, userId);
      if (!requestSessionMatches(userId, sessionGeneration)) throw new axios.CanceledError();
      notifyCreditChange();
      return normalize(response.data);
    } catch (error) {
      if (isDefinitiveRejection(error)) await finishRequest(request, userId);
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancelPending);
    }
  },

  /** Mesma análise sem conta (App Store 5.1.1(v)) — limitada por IP no backend. */
  analyzePhotoGuest: (image: string) =>
    api
      .post<unknown>('/scanner/analyze-guest', { image }, { timeout: 75000 })
      .then((r) => normalize(r.data)),
};
