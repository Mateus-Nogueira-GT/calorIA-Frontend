import { Alert } from 'react-native';
import { create } from 'zustand';
import { weightService } from '@shared/services/weight.service';
import type { WeightEntry } from '@shared/services/weight.service';

interface WeightState {
  entries: WeightEntry[];
  isLoading: boolean;
  isSaving: boolean;
  load: () => Promise<void>;
  addEntry: (weightKg: number, date: string) => Promise<void>;
  clear: () => void;
}

const initialState = { entries: [] as WeightEntry[], isLoading: false, isSaving: false };

function upsert(entries: WeightEntry[], next: WeightEntry): WeightEntry[] {
  const without = entries.filter((e) => e.date !== next.date);
  return [...without, next].sort((a, b) => a.date.localeCompare(b.date));
}

export const useWeightStore = create<WeightState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const entries = await weightService.getHistory();
      set({ entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)), isLoading: false });
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  addEntry: async (weightKg, date) => {
    const snapshot = get().entries;
    const optimistic: WeightEntry = { id: `temp-${date}`, date, weightKg };
    set({ entries: upsert(snapshot, optimistic), isSaving: true });
    try {
      const saved = await weightService.addEntry(weightKg, date);
      set((s) => ({ entries: upsert(s.entries.filter((e) => e.id !== optimistic.id), saved), isSaving: false }));
    } catch (e) {
      set({ entries: snapshot, isSaving: false });
      Alert.alert('Não foi possível salvar o peso', 'Tente novamente.');
      throw e;
    }
  },

  clear: () => set({ ...initialState }),
}));
