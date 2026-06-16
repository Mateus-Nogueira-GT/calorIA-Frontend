import { useDietStore } from '../store';

export function useDiet() {
  const plan = useDietStore((s) => s.plan);
  const isLoading = useDietStore((s) => s.isLoading);
  const togglingMealId = useDietStore((s) => s.togglingMealId);
  const toggleMealComplete = useDietStore((s) => s.toggleMealComplete);
  const loadCurrent = useDietStore((s) => s.loadCurrent);

  const meals = plan?.meals ?? [];
  const completedCount = meals.filter((m) => m.completedAt !== null).length;
  const totalCount = meals.length;

  return {
    plan,
    isLoading,
    togglingMealId,
    toggleMealComplete,
    loadCurrent,
    completedCount,
    totalCount,
  };
}
