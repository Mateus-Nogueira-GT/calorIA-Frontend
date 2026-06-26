import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useScannerStore } from './store';

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

  it('analyze em erro seta error e isAnalyzing=false', async () => {
    scannerService.analyzePhoto.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useScannerStore());
    await act(async () => {
      await result.current.analyze('data:image/jpeg;base64,AAA');
    });
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.error).toBe('Não foi possível analisar a imagem.');
  });

  it('confirm em erro relança e mantém items', async () => {
    foodLogService.addMeal.mockRejectedValue(new Error('server'));
    useScannerStore.setState({ items: [item('1')] });
    const { result } = renderHook(() => useScannerStore());
    await act(async () => {
      await expect(result.current.confirm()).rejects.toThrow();
    });
    expect(useScannerStore.getState().items).toHaveLength(1);
  });

  it('addManualItem gera ids sequenciais determinísticos após clear', () => {
    useScannerStore.getState().clear();
    useScannerStore.getState().addManualItem();
    useScannerStore.getState().addManualItem();
    const ids = useScannerStore.getState().items.map((i) => i.id);
    // After clear, seq resets; first two items should have consistent ids
    expect(ids[0]).toBe('manual-0');
    expect(ids[1]).toBe('manual-1');
  });
});
