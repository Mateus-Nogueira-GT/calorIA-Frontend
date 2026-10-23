import { create } from 'zustand';
import { creditErrorMessage } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';
import { scannerService } from '@shared/services/scanner.service';
import type { ScanItem } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';
import { useFoodLogStore } from '@features/food-log/store';
import { isValidScanWeight, roundScanAmount, scaleScanPortion } from '@shared/utils/scan-portion';
import { todayString } from '@shared/utils/date';
import { showAlert } from '@shared/utils/show-alert';
import { captureSessionOwner, isCurrentOwner } from '@shared/services/session-owner';

interface ScannerState {
  image: string | null;
  items: ScanItem[];
  isAnalyzing: boolean;
  invalidWeightIds: string[];
  error: string | null;

  analyze: (image: string, options?: { guest?: boolean }) => Promise<void>;
  updateItem: (id: string, patch: Partial<ScanItem>) => void;
  removeItem: (id: string) => void;
  addManualItem: () => void;
  confirm: () => Promise<void>;
  cancelAnalyze: () => void;
  reset: () => void;
  clear: () => void;
}

const initialState = {
  image: null as string | null,
  items: [] as ScanItem[],
  invalidWeightIds: [] as string[],
  isAnalyzing: false,
  error: null as string | null,
};

let manualSeq = 0;
let analysisGeneration = 0;
let analysisController: AbortController | null = null;

export const useScannerStore = create<ScannerState>((set, get) => ({
  ...initialState,

  analyze: async (image, options) => {
    const guest = options?.guest === true;
    if (get().isAnalyzing) return;
    const generation = useAuthStore.getState().sessionGeneration;
    const request = ++analysisGeneration;
    const controller = new AbortController();
    analysisController = controller;
    set({ image, isAnalyzing: true, error: null });
    try {
      const res = guest
        ? { ...(await scannerService.analyzePhotoGuest(image)), acknowledge: undefined }
        : await scannerService.analyzePhoto(image, controller.signal);
      if (
        generation !== useAuthStore.getState().sessionGeneration ||
        request !== analysisGeneration
      )
        return;
      set({ items: res.items, invalidWeightIds: [], isAnalyzing: false });
      void res.acknowledge?.();
    } catch (e) {
      if (
        generation !== useAuthStore.getState().sessionGeneration ||
        request !== analysisGeneration
      )
        return;
      // H5 da spec: 422 NOT_FOOD merece orientação, não erro genérico.
      const backendError = (e as { response?: { data?: { error?: string } } }).response?.data
        ?.error;
      const status = (e as { response?: { status?: number } }).response?.status;
      set({
        isAnalyzing: false,
        error:
          creditErrorMessage(e) ??
          (backendError === 'NOT_FOOD'
            ? 'Não identificamos comida nesta foto — tente outro ângulo ou mais luz.'
            : guest && status === 429
              ? 'Você atingiu o limite de análises sem conta. Crie uma conta para continuar.'
              : 'Não foi possível analisar a imagem.'),
      });
    }
  },

  updateItem: (id, patch) =>
    set((s) => {
      if (!s.items.some((item) => item.id === id)) return {};
      if (patch.weightGrams != null && !isValidScanWeight(patch.weightGrams)) {
        // Mantém a última porção válida para poder corrigir o campo sem perder a base.
        return { invalidWeightIds: [...new Set([...s.invalidWeightIds, id])] };
      }
      return {
        invalidWeightIds:
          patch.weightGrams === undefined
            ? s.invalidWeightIds
            : s.invalidWeightIds.filter((value) => value !== id),
        items: s.items.map((item) =>
          item.id !== id
            ? item
            : {
                ...item,
                ...(patch.weightGrams != null ? scaleScanPortion(item, patch.weightGrams) : {}),
                ...patch,
              },
        ),
      };
    }),

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      invalidWeightIds: s.invalidWeightIds.filter((value) => value !== id),
    })),

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
          fiber: null,
          confidence: 1,
        },
      ],
    })),

  confirm: async () => {
    if (
      get().invalidWeightIds.length > 0 ||
      get().items.some((item) => item.weightGrams != null && !isValidScanWeight(item.weightGrams))
    ) {
      showAlert('Confira o peso', 'Informe um peso entre 0,1 g e 100.000 g em cada item editado.');
      throw new Error('SCAN_CONFIRM_INVALID_WEIGHT');
    }
    const valid = get().items.filter((i) => i.name.trim().length > 0);
    // M7: sem itens válidos o fluxo caía direto no reset e o modal fechava como
    // se tivesse salvo — o usuário acreditava ter registrado a refeição.
    if (valid.length === 0) {
      showAlert('Nada para adicionar', 'Dê um nome a pelo menos um item antes de confirmar.');
      throw new Error('SCAN_CONFIRM_EMPTY');
    }
    // D01 (debug 18/10): a resposta pode chegar depois de logout/login ou de
    // uma nova análise. Dono e tentativa são capturados antes de salvar.
    const owner = captureSessionOwner();
    const attempt = analysisGeneration;
    // D2 da spec: allSettled + remoção incremental — item salvo SAI da lista na
    // hora, então um retry após falha parcial reenvia só o que faltou (antes o
    // Promise.all re-salvava os já persistidos, duplicando no diário).
    const results = await Promise.allSettled(
      valid.map((i) =>
        foodLogService
          .addMeal(
            {
              name: i.name.trim(),
              calories: roundScanAmount(i.calories),
              protein: roundScanAmount(i.protein),
              carbs: roundScanAmount(i.carbs),
              fat: roundScanAmount(i.fat),
              fiber: i.fiber == null ? null : roundScanAmount(i.fiber),
              ...(i.weightGrams != null ? { weightGrams: i.weightGrams } : {}),
            },
            owner,
          )
          .then((meal) => ({ scanItemId: i.id, meal })),
      ),
    );

    // Outra conta: nada desta resposta pode tocar o diário, o scanner ou alertas.
    if (!isCurrentOwner(owner)) throw new Error('SCAN_CONFIRM_STALE');
    const savedIds = new Set<string>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        savedIds.add(r.value.scanItemId);
        // D3: reflete no diário/dashboard imediatamente (o cache do dia já
        // carregado não refazia fetch e os itens escaneados "sumiam").
        useFoodLogStore.getState().addMeal(todayString(), r.value.meal);
      }
    }
    // Mesma conta, mas o scanner já é outra tentativa: as refeições são desta
    // conta e ficam no diário; o scan novo não é apagado.
    if (attempt !== analysisGeneration) throw new Error('SCAN_CONFIRM_STALE');
    set((s) => ({ items: s.items.filter((i) => !savedIds.has(i.id)) }));

    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      showAlert(
        'Não foi possível adicionar tudo',
        `${failures} ${failures === 1 ? 'item não foi salvo' : 'itens não foram salvos'}. Tente novamente.`,
      );
      throw new Error('SCAN_CONFIRM_PARTIAL');
    }
    set({ ...initialState });
  },

  cancelAnalyze: () => {
    analysisGeneration++;
    analysisController?.abort();
    analysisController = null;
    set({
      isAnalyzing: false,
      error:
        'Análise interrompida. Confira a solicitação em Créditos para verificar o resultado e a cobrança.',
    });
  },
  reset: () => {
    analysisGeneration++;
    analysisController?.abort();
    analysisController = null;
    set({ ...initialState });
  },
  clear: () => {
    analysisGeneration++;
    analysisController?.abort();
    analysisController = null;
    set({ ...initialState });
  },
}));
