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

export interface ScanAnalysis {
  items: ScanItem[];
}

interface RawItem extends Omit<ScanItem, 'id'> {
  id?: string;
}

let seq = 0;
function withId(item: RawItem): ScanItem {
  return { ...item, id: item.id ?? `scan-${Date.now()}-${seq++}` };
}

export const scannerService = {
  /** Envia a imagem (data URL base64) para análise IA Vision. */
  analyzePhoto: (image: string): Promise<ScanAnalysis> =>
    api.post<{ items?: RawItem[] } & Partial<RawItem>>('/scanner/analyze', { image }).then((r) => {
      const data = r.data;
      const list = Array.isArray(data.items) ? data.items : [data as RawItem];
      return { items: list.filter((i) => i && typeof i.name === 'string').map(withId) };
    }),
};
