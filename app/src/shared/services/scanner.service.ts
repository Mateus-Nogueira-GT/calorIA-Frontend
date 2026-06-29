import api from './api';

export interface ScanItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
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
          confidence: d.confidence ?? 1,
        },
      ],
    };
  }
  return { items: [] };
}

export const scannerService = {
  /** Envia a imagem como data URL base64 para análise via IA Vision. */
  analyzePhoto: (image: string) =>
    api.post<unknown>('/scanner/analyze', { image }).then((r) => normalize(r.data)),
};
