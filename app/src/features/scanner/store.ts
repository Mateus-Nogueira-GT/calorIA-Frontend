import { Alert } from 'react-native';
import { create } from 'zustand';
import { scannerService } from '@shared/services/scanner.service';
import type { ScanItem } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';
import { useFoodLogStore } from '@features/food-log/store';
import { todayString } from '@shared/utils/date';

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

let manualSeq = 0;

export const useScannerStore = create<ScannerState>((set, get) => ({
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
        {
          id: `manual-${manualSeq++}`,
          name: '',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          confidence: 1,
        },
      ],
    })),

  confirm: async () => {
    const valid = get().items.filter((i) => i.name.trim().length > 0);
    // D2 da spec: allSettled + remoção incremental — item salvo SAI da lista na
    // hora, então um retry após falha parcial reenvia só o que faltou (antes o
    // Promise.all re-salvava os já persistidos, duplicando no diário).
    const results = await Promise.allSettled(
      valid.map((i) =>
        foodLogService
          .addMeal({
            name: i.name.trim(),
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
          })
          .then((meal) => ({ scanItemId: i.id, meal })),
      ),
    );

    const savedIds = new Set<string>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        savedIds.add(r.value.scanItemId);
        // D3: reflete no diário/dashboard imediatamente (o cache do dia já
        // carregado não refazia fetch e os itens escaneados "sumiam").
        useFoodLogStore.getState().addMeal(todayString(), r.value.meal);
      }
    }
    set((s) => ({ items: s.items.filter((i) => !savedIds.has(i.id)) }));

    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      Alert.alert(
        'Não foi possível adicionar tudo',
        `${failures} ${failures === 1 ? 'item não foi salvo' : 'itens não foram salvos'}. Tente novamente.`,
      );
      throw new Error('SCAN_CONFIRM_PARTIAL');
    }
    set({ ...initialState });
  },

  reset: () => set({ ...initialState }),
  clear: () => set({ ...initialState }),
}));
