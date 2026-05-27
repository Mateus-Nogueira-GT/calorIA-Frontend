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
  analyzePhoto: (uri: string) =>
    api.post<ScanResult>('/scanner/analyze', { uri }).then((r) => r.data),
  analyzeBarcode: (barcode: string) =>
    api.get<ScanResult>(`/scanner/barcode/${barcode}`).then((r) => r.data),
};
