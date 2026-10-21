import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScannerStore } from './store';

jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { showAlert } = require('@shared/utils/show-alert');

jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn(), analyzePhotoGuest: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('@shared/services/scanner.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { foodLogService } = require('@shared/services/food-log.service');

const item = (id: string) => ({
  id,
  name: 'Arroz',
  calories: 200,
  protein: 4,
  carbs: 44,
  fat: 1,
  confidence: 0.9,
});

describe('useScannerStore', () => {
  beforeEach(() => {
    useScannerStore.setState({ image: null, items: [], isAnalyzing: false, error: null });
    jest.clearAllMocks();
  });

  it('analyze popula items', async () => {
    scannerService.analyzePhoto.mockResolvedValue({
      items: [item('1'), item('2')],
      acknowledge: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    const { result } = renderHook(() => useScannerStore());
    await act(() => result.current.analyze('data:image/jpeg;base64,AAA'));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.isAnalyzing).toBe(false);
  });

  it('analyze em modo convidado usa o endpoint sem conta', async () => {
    scannerService.analyzePhotoGuest.mockResolvedValue({ items: [item('1')] });
    await useScannerStore.getState().analyze('data:image/jpeg;base64,AAA', { guest: true });
    expect(scannerService.analyzePhotoGuest).toHaveBeenCalled();
    expect(scannerService.analyzePhoto).not.toHaveBeenCalled();
    expect(useScannerStore.getState().items).toHaveLength(1);
  });

  it('convidado no limite (429) recebe convite para criar conta', async () => {
    scannerService.analyzePhotoGuest.mockRejectedValue({
      response: { status: 429, data: { error: 'TOO_MANY_REQUESTS' } },
    });
    await useScannerStore.getState().analyze('data:image/jpeg;base64,AAA', { guest: true });
    expect(useScannerStore.getState().error).toContain('Crie uma conta');
  });

  it('confirm envia a fibra do item ao diário', async () => {
    foodLogService.addMeal.mockResolvedValue({ id: 'meal' });
    useScannerStore.setState({ items: [{ ...item('1'), fiber: 6 }] });
    await useScannerStore.getState().confirm();
    expect(foodLogService.addMeal).toHaveBeenCalledWith(
      expect.objectContaining({ fiber: 6 }),
      expect.anything(),
    );
  });

  it('updateItem edita campos', () => {
    useScannerStore.setState({ items: [item('1')] });
    useScannerStore.getState().updateItem('1', { calories: 250 });
    expect(useScannerStore.getState().items[0].calories).toBe(250);
  });

  it('removeItem remove pelo id', () => {
    useScannerStore.setState({ items: [item('1'), item('2')] });
    useScannerStore.getState().removeItem('1');
    expect(useScannerStore.getState().items.map((i) => i.id)).toEqual(['2']);
  });

  it('addManualItem adiciona item em branco', () => {
    useScannerStore.getState().addManualItem();
    expect(useScannerStore.getState().items).toHaveLength(1);
    expect(useScannerStore.getState().items[0].name).toBe('');
  });

  it('confirm chama addMeal por item válido e reseta', async () => {
    foodLogService.addMeal.mockResolvedValue({});
    useScannerStore.setState({ items: [item('1'), item('2')] });
    const { result } = renderHook(() => useScannerStore());
    await act(() => result.current.confirm());
    expect(foodLogService.addMeal).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it('clear zera o estado', () => {
    useScannerStore.setState({ items: [item('1')], image: 'x' });
    useScannerStore.getState().clear();
    expect(useScannerStore.getState().items).toEqual([]);
    expect(useScannerStore.getState().image).toBeNull();
  });

  it('confirmar sem nenhum item nomeado não fecha como se tivesse salvo (M7)', async () => {
    // A IA não identificou nada, o usuário adicionou um item e esqueceu o nome:
    // o modal fechava sem erro e sem registrar, e ele acreditava ter salvo.
    useScannerStore.setState({
      image: 'data:image/jpeg;base64,AAA',
      items: [{ ...item('1'), name: '   ' }],
      isAnalyzing: false,
      error: null,
    });
    const { result } = renderHook(() => useScannerStore());

    await act(async () => {
      await expect(result.current.confirm()).rejects.toThrow('SCAN_CONFIRM_EMPTY');
    });

    expect(showAlert).toHaveBeenCalled();
    expect(foodLogService.addMeal).not.toHaveBeenCalled();
    // O estado NÃO é resetado: o usuário continua na tela para nomear o item.
    expect(useScannerStore.getState().items).toHaveLength(1);
  });
});
describe('scanner request generations', () => {
  it('a reset followed by another scan ignores the older result', async () => {
    let resolveOld!: (value: {
      items: ReturnType<typeof item>[];
      acknowledge: () => Promise<void>;
    }) => void;
    scannerService.analyzePhoto.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = useScannerStore.getState().analyze('old-photo');
    useScannerStore.getState().reset();
    scannerService.analyzePhoto.mockResolvedValueOnce({
      items: [item('new')],
      acknowledge: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    await useScannerStore.getState().analyze('new-photo');
    resolveOld({
      items: [item('old')],
      acknowledge: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });
    await old;
    expect(useScannerStore.getState().image).toBe('new-photo');
    expect(useScannerStore.getState().items[0].id).toBe('new');
  });
});

describe('confirm e troca de sessão/tentativa (D01)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require('@features/auth/store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useFoodLogStore } = require('@features/food-log/store');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { todayString } = require('@shared/utils/date');
  const named = (id: string, name: string) => ({ ...item(id), name });
  const meal = (id: string, name: string) => ({
    id,
    name,
    calories: 200,
    protein: 4,
    carbs: 44,
    fat: 1,
    loggedAt: new Date().toISOString(),
    mealType: 'other',
  });
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
  const diary = () => useFoodLogStore.getState().mealsByDate[todayString()] ?? [];

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearToken();
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'old-user', name: 'Old', email: 'old@example.test' },
    });
    useScannerStore.setState({ image: null, items: [], isAnalyzing: false, error: null });
  });

  it('confirmação antiga não entra no diário da conta seguinte nem apaga o scan dela', async () => {
    const save = deferred();
    foodLogService.addMeal.mockReturnValueOnce(save.promise);
    useScannerStore.setState({ items: [named('old-scan', 'Private meal of account A')] });
    const saving = useScannerStore.getState().confirm();
    useAuthStore.getState().clearToken();
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'new-user', name: 'New', email: 'new@example.test' },
    });
    useScannerStore.setState({
      image: 'new-account-image',
      items: [named('new-scan', 'Unsaved scan of account B')],
    });
    save.resolve(meal('old-meal', 'Private meal of account A'));
    await expect(saving).rejects.toThrow('SCAN_CONFIRM_STALE');
    expect(diary()).toEqual([]);
    expect(useScannerStore.getState().items.map((entry) => entry.id)).toEqual(['new-scan']);
    expect(useScannerStore.getState().image).toBe('new-account-image');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('mesma conta, nova análise durante o salvamento: refeição entra no diário e o novo scan fica intacto', async () => {
    const save = deferred();
    foodLogService.addMeal.mockReturnValueOnce(save.promise);
    useScannerStore.setState({ items: [named('first', 'Primeiro')] });
    const saving = useScannerStore.getState().confirm();
    useScannerStore.getState().reset();
    useScannerStore.setState({ image: 'segunda', items: [named('second', 'Segundo')] });
    save.resolve(meal('first-meal', 'Primeiro'));
    await expect(saving).rejects.toThrow('SCAN_CONFIRM_STALE');
    expect(diary().map((entry: { id: string }) => entry.id)).toEqual(['first-meal']);
    expect(useScannerStore.getState().items.map((entry) => entry.id)).toEqual(['second']);
    expect(useScannerStore.getState().image).toBe('segunda');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('falha parcial depois da troca de conta não mostra alerta', async () => {
    const save = deferred();
    foodLogService.addMeal.mockReturnValueOnce(save.promise);
    useScannerStore.setState({ items: [named('old-scan', 'Privada')] });
    const saving = useScannerStore.getState().confirm();
    useAuthStore.getState().clearToken();
    save.reject(new Error('network'));
    await expect(saving).rejects.toThrow('SCAN_CONFIRM_STALE');
    expect(showAlert).not.toHaveBeenCalled();
  });

  it('confirm vincula cada salvamento ao dono atual', async () => {
    foodLogService.addMeal.mockResolvedValue(meal('m', 'Arroz'));
    useScannerStore.setState({ items: [item('1')] });
    await useScannerStore.getState().confirm();
    expect(foodLogService.addMeal).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Arroz' }),
      expect.objectContaining({ userId: 'old-user' }),
    );
  });
});
