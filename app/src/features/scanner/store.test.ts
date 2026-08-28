import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScannerStore } from './store';

jest.mock('@shared/utils/show-alert', () => ({ showAlert: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { showAlert } = require('@shared/utils/show-alert');

jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('@shared/services/scanner.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { foodLogService } = require('@shared/services/food-log.service');

const item = (id: string) => ({ id, name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 });

describe('useScannerStore', () => {
  beforeEach(() => {
    useScannerStore.setState({ image: null, items: [], isAnalyzing: false, error: null });
    jest.clearAllMocks();
  });

  it('analyze popula items', async () => {
    scannerService.analyzePhoto.mockResolvedValue({ items: [item('1'), item('2')] });
    const { result } = renderHook(() => useScannerStore());
    await act(() => result.current.analyze('data:image/jpeg;base64,AAA'));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.isAnalyzing).toBe(false);
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