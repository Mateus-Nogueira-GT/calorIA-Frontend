import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useWeightStore } from './store';
import type { WeightEntry } from '@shared/services/weight.service';

const entry = (id: string, date: string, weightKg: number): WeightEntry => ({ id, date, weightKg });

jest.mock('@shared/services/weight.service', () => ({
  weightService: { getHistory: jest.fn(), addEntry: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { weightService } = require('@shared/services/weight.service');

describe('useWeightStore', () => {
  beforeEach(() => {
    useWeightStore.setState({ entries: [], isLoading: false, isSaving: false });
    jest.clearAllMocks();
  });

  it('load popula entries', async () => {
    weightService.getHistory.mockResolvedValue([entry('1', '2026-06-20', 80)]);
    const { result } = renderHook(() => useWeightStore());
    await act(() => result.current.load());
    expect(result.current.entries).toHaveLength(1);
  });

  it('addEntry insere otimista (ordenado por data) e reconcilia', async () => {
    useWeightStore.setState({ entries: [entry('1', '2026-06-20', 80)] });
    weightService.addEntry.mockResolvedValue(entry('2', '2026-06-21', 79.5));
    const { result } = renderHook(() => useWeightStore());
    await act(() => result.current.addEntry(79.5, '2026-06-21'));
    expect(result.current.entries.map((e) => e.date)).toEqual(['2026-06-20', '2026-06-21']);
  });

  it('addEntry faz upsert por data (substitui o do mesmo dia)', async () => {
    useWeightStore.setState({ entries: [entry('1', '2026-06-20', 80)] });
    weightService.addEntry.mockResolvedValue(entry('1', '2026-06-20', 81));
    const { result } = renderHook(() => useWeightStore());
    await act(() => result.current.addEntry(81, '2026-06-20'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].weightKg).toBe(81);
  });

  it('addEntry reverte em erro', async () => {
    useWeightStore.setState({ entries: [entry('1', '2026-06-20', 80)] });
    weightService.addEntry.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useWeightStore());
    await act(async () => {
      try { await result.current.addEntry(79, '2026-06-21'); } catch { /* expected */ }
    });
    expect(result.current.entries).toHaveLength(1);
  });

  it('clear zera o estado', () => {
    useWeightStore.setState({ entries: [entry('1', '2026-06-20', 80)] });
    useWeightStore.getState().clear();
    expect(useWeightStore.getState().entries).toEqual([]);
  });
});
