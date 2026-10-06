import { create } from 'zustand';
import { dietService, DietPlan, TodayStatus } from '@shared/services/diet.service';
import { showAlert } from '@shared/utils/show-alert';

interface DietState {
  plan: DietPlan | null | undefined;
  isLoading: boolean;
  /** A última carga falhou. Limpo no início de cada tentativa. */
  error: boolean;
  /** Só preenchido quando `plan` é null: diz se falta gerar o dia (M8). */
  todayStatus: TodayStatus | null;
  togglingMealId: string | null;
  loadCurrent: () => Promise<void>;
  toggleMealComplete: (mealId: string) => Promise<void>;
  clear: () => void;
}

export const useDietStore = create<DietState>((set, get) => ({
  plan: undefined,
  isLoading: false,
  error: false,
  todayStatus: null,
  togglingMealId: null,

  loadCurrent: async () => {
    // Sem `error`, uma falha deixava plan===undefined para sempre e a seção
    // ficava em esqueleto eterno: nada distinguia "carregando" de "falhou".
    set({ isLoading: true, error: false });
    try {
      const fetched = await dietService.getToday();
      // Um toggle em voo já aplicou o estado otimista; o GET pode ter sido
      // servido antes do toggle e apagaria a marcação. Preserva a dessa refeição.
      const { togglingMealId, plan: current } = get();
      const inFlight = togglingMealId ? current?.meals.find((m) => m.id === togglingMealId) : null;
      const plan =
        fetched && inFlight
          ? {
              ...fetched,
              meals: fetched.meals.map((m) =>
                m.id === inFlight.id
                  ? {
                      ...m,
                      completedAt: inFlight.completedAt,
                      completedToday: inFlight.completedToday,
                    }
                  : m,
              ),
            }
          : fetched;
      set({ plan, isLoading: false });
      // Só quando não há plano: distingue "sem dieta" de "dia não gerado", para
      // não mostrar o vazio de onboarding a quem tem plano ativo incompleto.
      if (plan === null) {
        set({ todayStatus: await dietService.getTodayStatus() });
      } else {
        set({ todayStatus: null });
      }
    } catch {
      set({ isLoading: false, error: true });
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
