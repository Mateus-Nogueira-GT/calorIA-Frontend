import { Alert } from 'react-native';
import { create } from 'zustand';
import { scannerService } from '@shared/services/scanner.service';
import type { ScanItem } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';

interface ScannerState {
  image: string | null;
  items: ScanItem[];
  isAnalyzing: boolean;
  error: string | null;

  analyze: (image: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<ScanItem>) => void;
  removeItem: (id: string) => void;
  addManualItem: () => void;
  confirm: () => Promise<void>;
  reset: () => void;
  clear: () => void;
}

const initialState = {
  image: null as string | null,
  items: [] as ScanItem[],
  isAnalyzing: false,
  error: null as string | null,
};

export const useScannerStore = create<ScannerState>((set, get) => {
  let manualSeq = 0;
  return {
    ...initialState,

    analyze: async (image) => {
      set({ image, isAnalyzing: true, error: null });
      try {
        const res = await scannerService.analyzePhoto(image);
        set({ items: res.items, isAnalyzing: false });
      } catch {
        set({ isAnalyzing: false, error: 'Não foi possível analisar a imagem.' });
      }
    },

    updateItem: (id, patch) =>
      set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

    removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

    addManualItem: () =>
      set((s) => ({
        items: [
          ...s.items,
          { id: `manual-${manualSeq++}`, name: '', calories: 0, protein: 0, carbs: 0, fat: 0, confidence: 1 },
        ],
      })),

    confirm: async () => {
      const valid = get().items.filter((i) => i.name.trim().length > 0);
      try {
        await Promise.all(
          valid.map((i) =>
            foodLogService.addMeal({
              name: i.name.trim(),
              calories: i.calories,
              protein: i.protein,
              carbs: i.carbs,
              fat: i.fat,
            }),
          ),
        );
        set({ ...initialState });
      } catch (e) {
        Alert.alert('Não foi possível adicionar ao diário', 'Tente novamente.');
        throw e;
      }
    },

    reset: () => { manualSeq = 0; set({ ...initialState }); },
    clear: () => { manualSeq = 0; set({ ...initialState }); },
  };
});
