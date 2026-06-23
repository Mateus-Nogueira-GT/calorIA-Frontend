import api from './api';

export interface ScanResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
}

export const scannerService = {
  /** Envia a imagem como data URL base64 para análise via IA Vision. */
  analyzePhoto: (image: string) =>
    api.post<ScanResult>('/scanner/analyze', { image }).then((r) => r.data),
};
