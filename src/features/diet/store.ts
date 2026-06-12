import { Alert } from 'react-native';
import { create } from 'zustand';
import { dietService, DietPlan } from '@shared/services/diet.service';

interface DietState {
  plan: DietPlan | null | undefined;
  isLoading: boolean;
  isGenerating: boolean;
  togglingMealId: string | null;
  loadCurrent: () => Promise<void>;
  generate: () => Promise<DietPlan>;
  toggleMealComplete: (mealId: string) => Promise<void>;
  clear: () => void;
}

export const useDietStore = create<DietState>((set, get) => ({
  plan: undefined,
  isLoading: false,
  isGenerating: false,
  togglingMealId: null,

  loadCurrent: async () => {
    set({ isLoading: true });
    try {
      const plan = await dietService.getCurrent();
      set({ plan, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  generate: async () => {
    set({ isGenerating: true });
    try {
      const plan = await dietService.generate();
      set({ plan, isGenerating: false });
      return plan;
    } catch (e) {
      set({ isGenerating: false });
      throw e;
    }
  },

  toggleMealComplete: async (mealId) => {
    const { plan } = get();
    if (!plan) return;
    const meal = plan.meals.find((m) => m.id === mealId);
    if (!meal) return;
    const wasCompleted = meal.completedAt !== null;
    const optimisticAt = wasCompleted ? null : new Date().toISOString();
    set({
      togglingMealId: mealId,
      plan: {
        ...plan,
        meals: plan.meals.map((m) =>
          m.id === mealId ? { ...m, completedAt: optimisticAt } : m,
        ),
      },
    });
    try {
      const updated = wasCompleted
        ? await dietService.uncompleteMeal(mealId)
        : await dietService.completeMeal(mealId);
      set((s) => ({
        togglingMealId: null,
        plan: s.plan
          ? { ...s.plan, meals: s.plan.meals.map((m) => (m.id === mealId ? updated : m)) }
          : s.plan,
      }));
    } catch (e) {
      set((s) => ({
        togglingMealId: null,
        plan: s.plan
          ? {
              ...s.plan,
              meals: s.plan.meals.map((m) =>
                m.id === mealId ? { ...m, completedAt: meal.completedAt } : m,
              ),
            }
          : s.plan,
      }));
      Alert.alert('Não foi possível marcar a refeição', 'Tente novamente.');
      throw e;
    }
  },

  clear: () => set({ plan: undefined, isLoading: false, isGenerating: false, togglingMealId: null }),
}));
