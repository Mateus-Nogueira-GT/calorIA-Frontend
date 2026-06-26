import { useEffect, useState } from 'react';
import { useWeightStore } from '../store';

export function useEvolution() {
  const entries = useWeightStore((s) => s.entries);
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
