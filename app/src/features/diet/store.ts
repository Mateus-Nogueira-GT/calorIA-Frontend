import { create } from 'zustand';
import { dietService, DietPlan } from '@shared/services/diet.service';
import { showAlert } from '@shared/utils/show-alert';

interface DietState {
  plan: DietPlan | null | undefined;
  isLoading: boolean;
  togglingMealId: string | null;
  loadCurrent: () => Promise<void>;
  toggleMealComplete: (mealId: string) => Promise<void>;
  clear: () => void;
}

export const useDietStore = create<DietState>((set, get) => ({
  plan: undefined,
  isLoading: false,
  togglingMealId: null,

  loadCurrent: async () => {
    set({ isLoading: true });
    try {
      const plan = await dietService.getToday();
      set({ plan, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  toggleMealComplete: async (mealId) => {
    const { plan } = get();
    if (!plan) return;
    const meal = plan.meals.find((m) => m.id === mealId);
    if (!meal) return;
    // completedToday é o campo canônico (derivado por dia local no backend) —
    // completedAt cru pode ser de semanas atrás e não significa "feita hoje".
    const wasCompleted = meal.completedToday;
    const optimisticAt = wasCompleted ? null : new Date().toISOString();
    set({
      togglingMealId: mealId,
      plan: {
        ...plan,
        meals: plan.meals.map((m) =>
          m.id === mealId ? { ...m, completedAt: optimisticAt, completedToday: !wasCompleted } : m,
        ),
      },
    });
    try {
      const { is_completed } = await dietService.toggleMeal(mealId);
      set((s) => ({
        togglingMealId: null,
        plan: s.plan
          ? {
              ...s.plan,
              meals: s.plan.meals.map((m) =>
                m.id === mealId
                  ? {
                      ...m,
                      completedAt: is_completed ? optimisticAt : null,
                      completedToday: is_completed,
                    }
                  : m,
              ),
            }
          : s.plan,
      }));
    } catch (e) {
      set((s) => ({
        togglingMealId: null,
        plan: s.plan
          ? {
              ...s.plan,
              meals: s.plan.meals.map((m) =>
                m.id === mealId
                  ? { ...m, completedAt: meal.completedAt, completedToday: meal.completedToday }
                  : m,
              ),
            }
          : s.plan,
      }));
      showAlert('Não foi possível marcar a refeição', 'Tente novamente.');
      throw e;
    }
  },

  clear: () => set({ plan: undefined, isLoading: false, togglingMealId: null }),
}));
