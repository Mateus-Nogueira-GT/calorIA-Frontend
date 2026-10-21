import axios from 'axios';
import api from './api';
import { notifyCreditChange } from './credits.service';
import {
  beginRequest,
  finishRequest,
  isDefinitiveRejection,
} from './operation-requests';
import { bindRequestToOwner, captureSessionOwner, isCurrentOwner } from './session-owner';

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
    const owner = captureSessionOwner();
    const userId = owner.userId;
    const request = await beginRequest('photo', image);
    if (!isCurrentOwner(owner) || signal?.aborted)
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
          /* Recover by operation key when server cancellation is uncertain. */
        })
        .finally(cancellation.release);
    };
    const binding = bindRequestToOwner(owner, signal);
    signal?.addEventListener('abort', cancelPending, { once: true });
    try {
      const response = await api.post<unknown>(
        '/scanner/analyze',
        { image },
        {
          timeout: 75000,
          headers: { 'Idempotency-Key': request.key },
          ...binding.config,
        },
      );
      if (!isCurrentOwner(owner)) throw new axios.CanceledError();
      notifyCreditChange();
      return {
        ...normalize(response.data),
        acknowledge: () => finishRequest(request, userId),
      };
    } catch (error) {
      if (isDefinitiveRejection(error)) await finishRequest(request, userId);
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancelPending);
      binding.release();
    }
  },

  /** Mesma análise sem conta (App Store 5.1.1(v)) — limitada por IP no backend. */
  analyzePhotoGuest: (image: string) =>
    api
      .post<unknown>('/scanner/analyze-guest', { image }, { timeout: 75000 })
      .then((r) => normalize(r.data)),
};
