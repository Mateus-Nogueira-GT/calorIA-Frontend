import { useEffect, useMemo, useState } from 'react';
import { useWeightStore } from '../store';
import { isPlausibleWeightKg } from '@shared/utils/body-limits';

export function useEvolution() {
  const allEntries = useWeightStore((s) => s.entries);
  // Peso impossível gravado antes do limite (ex.: 0,5 kg) não é dado: fica
  // fora do gráfico e da variação.
  const entries = useMemo(() => allEntries.filter((e) => isPlausibleWeightKg(e.weightKg)), [allEntries]);
  const isLoading = useWeightStore((s) => s.isLoading);
  const isSaving = useWeightStore((s) => s.isSaving);
  const load = useWeightStore((s) => s.load);
  const addEntry = useWeightStore((s) => s.addEntry);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    load().catch(() => setHasError(true));
  }, [load]);

  const reload = () => {
    setHasError(false);
    load().catch(() => setHasError(true));
  };

  const currentWeight = entries.length ? entries[entries.length - 1].weightKg : null;
  const firstWeight = entries.length ? entries[0].weightKg : null;
  const delta = currentWeight !== null && firstWeight !== null ? Number((currentWeight - firstWeight).toFixed(1)) : 0;

  return { entries, isLoading, isSaving, addEntry, currentWeight, delta, hasError, reload };
}
