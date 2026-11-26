import { create } from 'zustand';
import { weightService } from '@shared/services/weight.service';
import type { WeightEntry } from '@shared/services/weight.service';
import { showAlert } from '@shared/utils/show-alert';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

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

  // R5 (26/11): a resposta que chega depois de trocar de conta é da anterior;
  // o logout já limpou o store e ela não pode repopular o da seguinte.
  load: async () => {
    const owner = captureSessionOwner();
    set({ isLoading: true });
    try {
      const entries = await weightService.getHistory();
      if (!isCurrentOwner(owner)) return;
      set({ entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)), isLoading: false });
    } catch (e) {
      if (!isCurrentOwner(owner)) return;
      set({ isLoading: false });
      throw e;
    }
  },

  addEntry: async (weightKg, date) => {
    const owner = captureSessionOwner();
    const snapshot = get().entries;
    const optimistic: WeightEntry = { id: `temp-${date}`, date, weightKg };
    set({ entries: upsert(snapshot, optimistic), isSaving: true });
    try {
      const saved = await weightService.addEntry(weightKg, date);
      if (!isCurrentOwner(owner)) return;
      set((s) => ({ entries: upsert(s.entries.filter((e) => e.id !== optimistic.id), saved), isSaving: false }));
    } catch (e) {
      // O rollback restauraria o histórico da conta anterior na seguinte.
      if (!isCurrentOwner(owner)) return;
      set({ entries: snapshot, isSaving: false });
      showAlert('Não foi possível salvar o peso', 'Tente novamente.');
      throw e;
    }
  },

  clear: () => set({ ...initialState }),
}));
