# Diet Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a feature de dieta gerada pela IA — itens D13–D16 do checklist: tela com cards por refeição, marcar refeição como concluída, e redirecionamento pós-chat para o Dashboard com a dieta.

**Architecture:** Nova feature isolada em `src/features/diet/` (store + componentes + hook) com service compartilhado em `src/shared/services/diet.service.ts`. O `DashboardScreen` compõe o `DietPlanSection` (sem nova tab). O `CoachScreen` ganha um `GenerateDietButton` ancorado na última mensagem do coach com flag `canGenerateDiet`. Toggle de conclusão de refeição usa atualização otimista. Backend assume LLM-driven (mockado via MSW).

**Tech Stack:** React Native 0.76 + React Native Web, Zustand 4, Axios 1.7, MSW 2, Jest + @testing-library/react-native, React Navigation 6.

**Spec de referência:** `docs/superpowers/specs/2026-06-11-diet-feature-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/shared/services/diet.service.ts` | Tipos (`MealType`, `MealItem`, `PlannedMeal`, `DietPlan`) + HTTP: `getCurrent`, `generate`, `completeMeal`, `uncompleteMeal` |
| `src/features/diet/store.ts` | Zustand store: `plan`, `isLoading`, `isGenerating`, `togglingMealId`, ações `loadCurrent`, `generate`, `toggleMealComplete`, `clear` |
| `src/features/diet/store.test.ts` | Unit tests do store, incluindo toggle otimista e reversão em erro |
| `src/features/diet/hooks/useDiet.ts` | Hook agregador: expõe `plan`, `completedCount`, `totalCount`, `toggleMealComplete`, `isLoading` |
| `src/features/diet/components/MacroChips.tsx` | 4 chips coloridos: kcal / proteína / carbo / gordura |
| `src/features/diet/components/MealItemRow.tsx` | Linha "2 ovos · 140 kcal" |
| `src/features/diet/components/MealPlanCard.tsx` | Card expandido por refeição com botão de concluir |
| `src/features/diet/components/DietProgressHeader.tsx` | "Sua dieta de hoje" + "X de 4 refeições" + barra fina |
| `src/features/diet/components/EmptyDietState.tsx` | Placeholder "sem dieta" / variante de erro |
| `src/features/diet/components/MealCardSkeleton.tsx` | Esqueleto pulsante usado durante `loadCurrent` |
| `src/features/diet/components/DietPlanSection.tsx` | Orquestrador renderizado pelo Dashboard |
| `src/features/coach/components/GenerateDietButton.tsx` | Botão ancorado no chat |
| `mocks/handlers/diet.ts` | Handlers MSW para `/diet/current`, `/diet/generate`, `/diet/meals/:id/complete`, `/diet/meals/:id/uncomplete` |

### Modified files
| File | Mudança |
|------|---------|
| `src/shared/services/coach.service.ts` | Adicionar campo opcional `canGenerateDiet?: boolean` em `CoachMessage` |
| `src/features/coach/store.ts` | Propagar `canGenerateDiet` em `StoreMessage` e `toStoreMessage` |
| `src/features/coach/screens/CoachScreen.tsx` | Renderizar `GenerateDietButton` abaixo da última msg do coach com flag; navegar pro Dashboard no sucesso |
| `src/features/coach/store.test.ts` | Garantir que o flag é propagado |
| `mocks/handlers/coach.ts` | Marcar `canGenerateDiet: true` em determinadas respostas (mock do gatilho da LLM) |
| `mocks/server.ts` | Registrar `dietHandlers` |
| `src/features/dashboard/screens/DashboardScreen.tsx` | Compor `<DietPlanSection />`; metas e cálculo de macros derivam do `plan` quando existir |
| `src/features/auth/store.ts` | `clearToken` chama `useDietStore.getState().clear()` |

---

## Ordem de execução & dependências

```
T1 (service+types) ──▶ T2 (mock MSW) ──▶ T3 (store) ──▶ T4 (hook)
                                                          │
T5 (MacroChips) ──┐                                        │
T6 (MealItemRow)──┤                                        │
T7 (MealPlanCard)─┼──▶ T10 (DietPlanSection) ◀────────────┘
T8 (ProgressHdr)──┤
T9 (Empty/Skel) ──┘

T11 (coach types) ──▶ T12 (coach store) ──▶ T13 (GenerateDietButton)
                                              │
                                              ▼
T14 (CoachScreen wiring) ──▶ T15 (DashboardScreen integration) ──▶ T16 (logout cleanup) ──▶ T17 (testes de componente) ──▶ T18 (verificação manual)
```

Cada task termina com commit.

---

## Task 1 — Diet service (tipos + HTTP)

**Files:**
- Create: `src/shared/services/diet.service.ts`

- [ ] **Step 1 — Criar o arquivo `diet.service.ts` com os tipos e o serviço**

```ts
// src/shared/services/diet.service.ts
import api from './api';

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface MealItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
}

export interface PlannedMeal {
  id: string;
  type: MealType;
  title: string;
  suggestedTime: string;
  items: MealItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  completedAt: string | null;
}

export interface DietPlan {
  id: string;
  date: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  generatedAt: string;
}

export const dietService = {
  getCurrent: () =>
    api.get<DietPlan | null>('/diet/current').then((r) => r.data),
  generate: () =>
    api.post<DietPlan>('/diet/generate').then((r) => r.data),
  completeMeal: (mealId: string) =>
    api.patch<PlannedMeal>(`/diet/meals/${mealId}/complete`).then((r) => r.data),
  uncompleteMeal: (mealId: string) =>
    api.patch<PlannedMeal>(`/diet/meals/${mealId}/uncomplete`).then((r) => r.data),
};
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS sem erros relacionados a `diet.service.ts`.

- [ ] **Step 3 — Commit**

```bash
git add src/shared/services/diet.service.ts
git commit -m "feat(diet): add diet service contract and types"
```

---

## Task 2 — MSW mock handlers para `/diet/*`

**Files:**
- Create: `mocks/handlers/diet.ts`
- Modify: `mocks/server.ts`
- Modify: `mocks/handlers/coach.ts`

- [ ] **Step 1 — Criar `mocks/handlers/diet.ts`**

```ts
// mocks/handlers/diet.ts
import { http, HttpResponse } from 'msw';

interface PlannedMeal {
  id: string;
  type: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  title: string;
  suggestedTime: string;
  items: { name: string; quantity: number; unit: string; calories: number }[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  completedAt: string | null;
}

interface DietPlan {
  id: string;
  date: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  generatedAt: string;
}

let currentPlan: DietPlan | null = null;

function buildSamplePlan(): DietPlan {
  const meals: PlannedMeal[] = [
    {
      id: 'meal-bf',
      type: 'breakfast',
      title: 'Café da manhã',
      suggestedTime: '08:00',
      items: [
        { name: 'Ovos mexidos', quantity: 2, unit: 'un', calories: 140 },
        { name: 'Pão integral', quantity: 1, unit: 'fatia', calories: 80 },
        { name: 'Banana', quantity: 1, unit: 'un', calories: 105 },
      ],
      calories: 420, protein: 22, carbs: 48, fat: 12, completedAt: null,
    },
    {
      id: 'meal-lc',
      type: 'lunch',
      title: 'Almoço',
      suggestedTime: '12:30',
      items: [
        { name: 'Peito de frango grelhado', quantity: 150, unit: 'g', calories: 240 },
        { name: 'Arroz integral', quantity: 1, unit: 'xíc', calories: 215 },
        { name: 'Salada com azeite', quantity: 1, unit: 'porção', calories: 110 },
        { name: 'Feijão', quantity: 0.5, unit: 'xíc', calories: 115 },
      ],
      calories: 680, protein: 45, carbs: 70, fat: 18, completedAt: null,
    },
    {
      id: 'meal-sn',
      type: 'snack',
      title: 'Lanche',
      suggestedTime: '16:00',
      items: [
        { name: 'Iogurte natural', quantity: 1, unit: 'pote', calories: 120 },
        { name: 'Maçã', quantity: 1, unit: 'un', calories: 100 },
      ],
      calories: 220, protein: 8, carbs: 32, fat: 6, completedAt: null,
    },
    {
      id: 'meal-dn',
      type: 'dinner',
      title: 'Jantar',
      suggestedTime: '19:30',
      items: [
        { name: 'Salmão grelhado', quantity: 150, unit: 'g', calories: 280 },
        { name: 'Batata-doce assada', quantity: 200, unit: 'g', calories: 180 },
        { name: 'Brócolis no vapor', quantity: 1, unit: 'porção', calories: 120 },
      ],
      calories: 580, protein: 40, carbs: 55, fat: 16, completedAt: null,
    },
  ];
  return {
    id: `diet-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    meals,
    totalCalories: 1900,
    totalProtein: 115,
    totalCarbs: 205,
    totalFat: 52,
    generatedAt: new Date().toISOString(),
  };
}

export const dietHandlers = [
  http.get('*/diet/current', () => HttpResponse.json(currentPlan)),

  http.post('*/diet/generate', () => {
    currentPlan = buildSamplePlan();
    return HttpResponse.json(currentPlan);
  }),

  http.patch('*/diet/meals/:mealId/complete', ({ params }) => {
    if (!currentPlan) return new HttpResponse(null, { status: 404 });
    const meal = currentPlan.meals.find((m) => m.id === params.mealId);
    if (!meal) return new HttpResponse(null, { status: 404 });
    meal.completedAt = new Date().toISOString();
    return HttpResponse.json(meal);
  }),

  http.patch('*/diet/meals/:mealId/uncomplete', ({ params }) => {
    if (!currentPlan) return new HttpResponse(null, { status: 404 });
    const meal = currentPlan.meals.find((m) => m.id === params.mealId);
    if (!meal) return new HttpResponse(null, { status: 404 });
    meal.completedAt = null;
    return HttpResponse.json(meal);
  }),
];
```

- [ ] **Step 2 — Registrar `dietHandlers` no `mocks/server.ts`**

Substituir o conteúdo de `mocks/server.ts`:

```ts
// mocks/server.ts
import { setupServer } from 'msw/node';
import { authHandlers } from './handlers/auth';
import { foodLogHandlers } from './handlers/food-log';
import { scannerHandlers } from './handlers/scanner';
import { coachHandlers } from './handlers/coach';
import { dietHandlers } from './handlers/diet';

export const server = setupServer(
  ...authHandlers,
  ...foodLogHandlers,
  ...scannerHandlers,
  ...coachHandlers,
  ...dietHandlers,
);

export function startMocks(): void {
  if (__DEV__) {
    server.listen({ onUnhandledRequest: 'warn' });
    console.log('[MSW] Mock server started');
  }
}
```

- [ ] **Step 3 — Atualizar `mocks/handlers/coach.ts` pra ativar `canGenerateDiet` após uma palavra-chave**

Substituir o handler de `POST /coach/message`:

```ts
// mocks/handlers/coach.ts
import { http, HttpResponse } from 'msw';

const mockHistory = [
  {
    id: 'msg-1',
    role: 'coach' as const,
    content: 'Olá! Sou o seu coach de nutrição. Como posso ajudar você hoje?',
    timestamp: new Date().toISOString(),
  },
];

const TRIGGER_KEYWORDS = ['gerar dieta', 'pode gerar', 'cria minha dieta', 'fechar dieta'];

export const coachHandlers = [
  http.get('*/coach/history', () => HttpResponse.json(mockHistory)),

  http.post('*/coach/message', async ({ request }) => {
    const body = (await request.json()) as { content: string };
    const lower = body.content.toLowerCase();
    const ready = TRIGGER_KEYWORDS.some((k) => lower.includes(k));
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'coach',
      content: ready
        ? 'Perfeito! Coletei tudo que preciso. Toque no botão abaixo pra eu gerar sua dieta personalizada.'
        : `Entendido! Você disse: "${body.content}". Vou analisar e te dar uma resposta personalizada.`,
      timestamp: new Date().toISOString(),
      ...(ready ? { canGenerateDiet: true } : {}),
    });
  }),
];
```

- [ ] **Step 4 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5 — Commit**

```bash
git add mocks/handlers/diet.ts mocks/server.ts mocks/handlers/coach.ts
git commit -m "feat(mocks): add MSW handlers for diet endpoints and coach trigger"
```

---

## Task 3 — Diet store (Zustand) com toggle otimista

**Files:**
- Create: `src/features/diet/store.ts`
- Create: `src/features/diet/store.test.ts`

- [ ] **Step 1 — Escrever os testes do store (vão falhar)**

```ts
// src/features/diet/store.test.ts
import { act, renderHook } from '@testing-library/react-native';
import { useDietStore } from './store';
import type { DietPlan, PlannedMeal } from '@shared/services/diet.service';

const meal = (id: string, completedAt: string | null = null): PlannedMeal => ({
  id, type: 'breakfast', title: 'Café',
  suggestedTime: '08:00', items: [],
  calories: 400, protein: 20, carbs: 50, fat: 10,
  completedAt,
});

const plan: DietPlan = {
  id: 'p1', date: '2026-06-11',
  meals: [meal('m1'), meal('m2', '2026-06-11T08:00:00Z')],
  totalCalories: 800, totalProtein: 40, totalCarbs: 100, totalFat: 20,
  generatedAt: '2026-06-11T07:00:00Z',
};

jest.mock('@shared/services/diet.service', () => ({
  dietService: {
    getCurrent: jest.fn(),
    generate: jest.fn(),
    completeMeal: jest.fn(),
    uncompleteMeal: jest.fn(),
  },
}));

import { dietService } from '@shared/services/diet.service';

describe('useDietStore', () => {
  beforeEach(() => {
    useDietStore.setState({
      plan: undefined, isLoading: false, isGenerating: false, togglingMealId: null,
    });
    jest.clearAllMocks();
  });

  it('loadCurrent popula o plan', async () => {
    (dietService.getCurrent as jest.Mock).mockResolvedValue(plan);
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.loadCurrent());
    expect(result.current.plan).toEqual(plan);
    expect(result.current.isLoading).toBe(false);
  });

  it('loadCurrent aceita null (sem dieta)', async () => {
    (dietService.getCurrent as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.loadCurrent());
    expect(result.current.plan).toBeNull();
  });

  it('generate persiste o plano retornado', async () => {
    (dietService.generate as jest.Mock).mockResolvedValue(plan);
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.generate());
    expect(result.current.plan).toEqual(plan);
    expect(result.current.isGenerating).toBe(false);
  });

  it('toggleMealComplete aplica otimista e substitui pela resposta', async () => {
    const completed: PlannedMeal = { ...meal('m1'), completedAt: '2026-06-11T08:30:00Z' };
    (dietService.completeMeal as jest.Mock).mockResolvedValue(completed);
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.toggleMealComplete('m1'));
    expect(result.current.plan?.meals[0].completedAt).toBe('2026-06-11T08:30:00Z');
    expect(result.current.togglingMealId).toBeNull();
  });

  it('toggleMealComplete reverte em caso de erro', async () => {
    (dietService.completeMeal as jest.Mock).mockRejectedValue(new Error('fail'));
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(async () => {
      try { await result.current.toggleMealComplete('m1'); } catch {}
    });
    expect(result.current.plan?.meals[0].completedAt).toBeNull();
    expect(result.current.togglingMealId).toBeNull();
  });

  it('toggleMealComplete chama uncompleteMeal quando a refeição já estava concluída', async () => {
    (dietService.uncompleteMeal as jest.Mock).mockResolvedValue({ ...meal('m2'), completedAt: null });
    useDietStore.setState({ plan });
    const { result } = renderHook(() => useDietStore());
    await act(() => result.current.toggleMealComplete('m2'));
    expect(dietService.uncompleteMeal).toHaveBeenCalledWith('m2');
    expect(result.current.plan?.meals[1].completedAt).toBeNull();
  });

  it('clear zera o estado', () => {
    useDietStore.setState({ plan });
    useDietStore.getState().clear();
    expect(useDietStore.getState().plan).toBeUndefined();
  });
});
```

- [ ] **Step 2 — Rodar testes (devem falhar)**

Run: `npx jest src/features/diet/store.test.ts`
Expected: FAIL (módulo `./store` não existe ainda).

- [ ] **Step 3 — Implementar o store**

```ts
// src/features/diet/store.ts
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
```

- [ ] **Step 4 — Rodar testes (devem passar)**

Run: `npx jest src/features/diet/store.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5 — Commit**

```bash
git add src/features/diet/store.ts src/features/diet/store.test.ts
git commit -m "feat(diet): add zustand store with optimistic meal toggle"
```

---

## Task 4 — Hook `useDiet`

**Files:**
- Create: `src/features/diet/hooks/useDiet.ts`

- [ ] **Step 1 — Escrever o hook**

```ts
// src/features/diet/hooks/useDiet.ts
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

  return { plan, isLoading, togglingMealId, toggleMealComplete, loadCurrent, completedCount, totalCount };
}
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/hooks/useDiet.ts
git commit -m "feat(diet): add useDiet hook with computed counts"
```

---

## Task 5 — `MacroChips`

**Files:**
- Create: `src/features/diet/components/MacroChips.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/diet/components/MacroChips.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';

interface Props {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroChips({ kcal, protein, carbs, fat }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.chip, styles.chipKcal]}>
        <Text style={[styles.chipText, styles.textKcal]}>{kcal} kcal</Text>
      </View>
      <View style={[styles.chip, styles.chipP]}>
        <Text style={[styles.chipText, styles.textP]}>P {protein}g</Text>
      </View>
      <View style={[styles.chip, styles.chipC]}>
        <Text style={[styles.chipText, styles.textC]}>C {carbs}g</Text>
      </View>
      <View style={[styles.chip, styles.chipF]}>
        <Text style={[styles.chipText, styles.textF]}>G {fat}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipKcal: { backgroundColor: '#E8F8EE' },
  textKcal: { color: '#2DB36A' },
  chipP: { backgroundColor: '#FFEFE3' },
  textP: { color: '#FF8C42' },
  chipC: { backgroundColor: '#E0F4F8' },
  textC: { color: '#17A2B8' },
  chipF: { backgroundColor: '#FFF6D9' },
  textF: { color: '#B8860B' },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/components/MacroChips.tsx
git commit -m "feat(diet): add MacroChips component"
```

---

## Task 6 — `MealItemRow`

**Files:**
- Create: `src/features/diet/components/MealItemRow.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/diet/components/MealItemRow.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';
import type { MealItem } from '@shared/services/diet.service';

interface Props { item: MealItem; }

function formatQuantity(q: number, unit: string): string {
  const qStr = Number.isInteger(q) ? q.toString() : q.toFixed(1).replace(/\.0$/, '');
  return `${qStr} ${unit}`;
}

export function MealItemRow({ item }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.qty}>{formatQuantity(item.quantity, item.unit)}</Text>
      </View>
      <Text style={styles.kcal}>{item.calories} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  left: { flexShrink: 1, paddingRight: 8 },
  name: { fontSize: 13, color: colors.textPrimary },
  qty: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  kcal: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/components/MealItemRow.tsx
git commit -m "feat(diet): add MealItemRow component"
```

---

## Task 7 — `MealPlanCard`

**Files:**
- Create: `src/features/diet/components/MealPlanCard.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/diet/components/MealPlanCard.tsx
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';
import type { PlannedMeal, MealType } from '@shared/services/diet.service';
import { MacroChips } from './MacroChips';
import { MealItemRow } from './MealItemRow';

interface Props {
  meal: PlannedMeal;
  isToggling: boolean;
  onToggleComplete: (mealId: string) => void;
}

const EMOJI: Record<MealType, string> = {
  breakfast: '🥐',
  lunch: '🍱',
  snack: '🍎',
  dinner: '🍽️',
};

export function MealPlanCard({ meal, isToggling, onToggleComplete }: Props): React.JSX.Element {
  const isDone = meal.completedAt !== null;
  return (
    <View style={[styles.card, isDone && styles.cardDone]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{EMOJI[meal.type]}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meal.title}</Text>
          <Text style={styles.time}>{meal.suggestedTime}</Text>
        </View>
      </View>

      <MacroChips kcal={meal.calories} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />

      <View style={styles.items}>
        {meal.items.map((item, idx) => (
          <MealItemRow key={`${meal.id}-${idx}`} item={item} />
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isToggling, selected: isDone }}
        disabled={isToggling}
        onPress={() => onToggleComplete(meal.id)}
        style={[styles.btn, isDone && styles.btnDone, isToggling && styles.btnDisabled]}
      >
        <Text style={[styles.btnText, isDone && styles.btnTextDone]}>
          {isDone ? '✓ Concluída' : 'Marcar como concluída'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardDone: { borderColor: colors.primary, backgroundColor: '#F6FBF8' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  emoji: { fontSize: 28 },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  time: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  items: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginBottom: 10 },
  btn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  btnTextDone: { color: colors.white },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/components/MealPlanCard.tsx
git commit -m "feat(diet): add MealPlanCard component"
```

---

## Task 8 — `DietProgressHeader`

**Files:**
- Create: `src/features/diet/components/DietProgressHeader.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/diet/components/DietProgressHeader.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { completedCount: number; totalCount: number; }

export function DietProgressHeader({ completedCount, totalCount }: Props): React.JSX.Element {
  const pct = totalCount > 0 ? completedCount / totalCount : 0;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sua dieta de hoje</Text>
      <Text style={styles.subtitle}>{completedCount} de {totalCount} refeições concluídas</Text>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  title: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2, marginBottom: 8 },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/components/DietProgressHeader.tsx
git commit -m "feat(diet): add DietProgressHeader component"
```

---

## Task 9 — `EmptyDietState` + `MealCardSkeleton`

**Files:**
- Create: `src/features/diet/components/EmptyDietState.tsx`
- Create: `src/features/diet/components/MealCardSkeleton.tsx`

- [ ] **Step 1 — Implementar `EmptyDietState`**

```tsx
// src/features/diet/components/EmptyDietState.tsx
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  errorMode?: boolean;
  onAction: () => void;
}

export function EmptyDietState({ errorMode, onAction }: Props): React.JSX.Element {
  const title = errorMode ? 'Não foi possível carregar sua dieta' : 'Você ainda não tem uma dieta';
  const subtitle = errorMode
    ? 'Toque pra tentar novamente.'
    : 'Fale com o Coach pra gerar uma dieta personalizada.';
  const cta = errorMode ? 'Tentar novamente' : 'Falar com o Coach';
  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{errorMode ? '⚠️' : '🥗'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <TouchableOpacity onPress={onAction} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: { fontSize: 36, marginBottom: 8 },
  title: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 4, marginBottom: 12, textAlign: 'center' },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2 — Implementar `MealCardSkeleton`**

```tsx
// src/features/diet/components/MealCardSkeleton.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@theme';

export function MealCardSkeleton(): React.JSX.Element {
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.line} />
      <View style={[styles.line, styles.short]} />
      <View style={styles.chips} />
      <View style={[styles.line, styles.long]} />
      <View style={[styles.line, styles.long]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  line: { height: 12, backgroundColor: colors.border, borderRadius: 6, marginBottom: 8 },
  short: { width: '40%' },
  long: { width: '80%' },
  chips: { height: 18, backgroundColor: colors.border, borderRadius: 8, width: '60%', marginBottom: 10 },
});
```

- [ ] **Step 3 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4 — Commit**

```bash
git add src/features/diet/components/EmptyDietState.tsx src/features/diet/components/MealCardSkeleton.tsx
git commit -m "feat(diet): add EmptyDietState and MealCardSkeleton"
```

---

## Task 10 — `DietPlanSection` (orquestrador)

**Files:**
- Create: `src/features/diet/components/DietPlanSection.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/diet/components/DietPlanSection.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '@navigation/types';
import { useDiet } from '../hooks/useDiet';
import { useDietStore } from '../store';
import { DietProgressHeader } from './DietProgressHeader';
import { MealPlanCard } from './MealPlanCard';
import { EmptyDietState } from './EmptyDietState';
import { MealCardSkeleton } from './MealCardSkeleton';

export function DietPlanSection(): React.JSX.Element {
  const { plan, togglingMealId, toggleMealComplete, completedCount, totalCount, loadCurrent } = useDiet();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const isLoading = useDietStore((s) => s.isLoading);

  if (plan === undefined || isLoading) {
    return (
      <View>
        <MealCardSkeleton />
        <MealCardSkeleton />
        <MealCardSkeleton />
        <MealCardSkeleton />
      </View>
    );
  }

  if (plan === null) {
    return <EmptyDietState onAction={() => nav.navigate('Coach')} />;
  }

  return (
    <View style={styles.container}>
      <DietProgressHeader completedCount={completedCount} totalCount={totalCount} />
      {plan.meals.map((meal) => (
        <MealPlanCard
          key={meal.id}
          meal={meal}
          isToggling={togglingMealId === meal.id}
          onToggleComplete={toggleMealComplete}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
});
```

Nota: o caso "erro de carregamento" não é distinguível do "null" no MVP — a store hoje só seta `plan` em sucesso e o usuário ainda verá `EmptyDietState` em modo normal. Caso queira distinguir, troque o catch do `loadCurrent` por `set({ plan: null, isLoading: false, hasError: true })` num passo futuro (fora do escopo desta task).

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/diet/components/DietPlanSection.tsx
git commit -m "feat(diet): add DietPlanSection orchestrator"
```

---

## Task 11 — Estender `CoachMessage` com `canGenerateDiet`

**Files:**
- Modify: `src/shared/services/coach.service.ts`

- [ ] **Step 1 — Adicionar campo opcional**

Substituir o conteúdo de `coach.service.ts`:

```ts
// src/shared/services/coach.service.ts
import api from './api';

export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
  canGenerateDiet?: boolean;
}

export const coachService = {
  getHistory: () =>
    api.get<CoachMessage[]>('/coach/history').then((r) => r.data),

  sendMessage: (content: string) =>
    api.post<CoachMessage>('/coach/message', { content }).then((r) => r.data),
};
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/shared/services/coach.service.ts
git commit -m "feat(coach): add canGenerateDiet flag to CoachMessage"
```

---

## Task 12 — Propagar `canGenerateDiet` no store do coach

**Files:**
- Modify: `src/features/coach/store.ts`
- Modify: `src/features/coach/store.test.ts`

- [ ] **Step 1 — Adicionar teste novo no `store.test.ts`**

Acrescentar ao final do `describe`:

```ts
it('preserva canGenerateDiet em mensagens do histórico', async () => {
  const { coachService } = require('@shared/services/coach.service');
  coachService.getHistory.mockResolvedValueOnce([
    { id: 'h1', role: 'coach', content: 'Pronto!', timestamp: '2026-01-01T00:00:00Z', canGenerateDiet: true },
  ]);
  const { result } = renderHook(() => useCoachStore());
  await act(() => result.current.loadHistory());
  expect(result.current.messages[0].canGenerateDiet).toBe(true);
});

it('preserva canGenerateDiet na resposta a sendMessage', async () => {
  const { coachService } = require('@shared/services/coach.service');
  coachService.sendMessage.mockResolvedValueOnce({
    id: 'r1', role: 'coach', content: 'Pode gerar!', timestamp: '2026-01-01T00:00:01Z', canGenerateDiet: true,
  });
  const { result } = renderHook(() => useCoachStore());
  await act(() => result.current.sendMessage('Tudo certo'));
  const last = result.current.messages[result.current.messages.length - 1];
  expect(last.canGenerateDiet).toBe(true);
});
```

- [ ] **Step 2 — Rodar testes (devem falhar — campo ainda não existe no `StoreMessage`)**

Run: `npx jest src/features/coach/store.test.ts`
Expected: FAIL nos dois testes novos.

- [ ] **Step 3 — Atualizar o `store.ts`**

Substituir o conteúdo:

```ts
// src/features/coach/store.ts
import { create } from 'zustand';
import { coachService, CoachMessage } from '@shared/services/coach.service';

interface StoreMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
  canGenerateDiet?: boolean;
}

interface CoachState {
  messages: StoreMessage[];
  isLoading: boolean;
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
}

function toStoreMessage(m: CoachMessage): StoreMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    ...(m.canGenerateDiet ? { canGenerateDiet: true } : {}),
  };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [],
  isLoading: false,

  loadHistory: async () => {
    const history = await coachService.getHistory();
    set({ messages: history.map(toStoreMessage) });
  },

  sendMessage: async (content: string) => {
    const userMsg: StoreMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    set({ messages: [...get().messages, userMsg], isLoading: true });
    try {
      const response = await coachService.sendMessage(content);
      set((s) => ({
        messages: [...s.messages, toStoreMessage(response)],
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },
}));
```

- [ ] **Step 4 — Rodar testes (devem passar)**

Run: `npx jest src/features/coach/store.test.ts`
Expected: PASS (todos os testes, novos e antigos).

- [ ] **Step 5 — Commit**

```bash
git add src/features/coach/store.ts src/features/coach/store.test.ts
git commit -m "feat(coach): propagate canGenerateDiet flag in store messages"
```

---

## Task 13 — `GenerateDietButton`

**Files:**
- Create: `src/features/coach/components/GenerateDietButton.tsx`

- [ ] **Step 1 — Implementar**

```tsx
// src/features/coach/components/GenerateDietButton.tsx
import React from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';
import { useDietStore } from '@features/diet/store';

interface Props { onSuccess: () => void; }

export function GenerateDietButton({ onSuccess }: Props): React.JSX.Element {
  const isGenerating = useDietStore((s) => s.isGenerating);
  const generate = useDietStore((s) => s.generate);

  const handlePress = async () => {
    try {
      await generate();
      onSuccess();
    } catch {
      Alert.alert('Não foi possível gerar sua dieta', 'Tente novamente.');
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isGenerating }}
        disabled={isGenerating}
        onPress={handlePress}
        style={[styles.btn, isGenerating && styles.btnDisabled]}
      >
        {isGenerating ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.btnText}>  Gerando sua dieta...</Text>
          </View>
        ) : (
          <Text style={styles.btnText}>✨ Gerar minha dieta agora</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 16, paddingHorizontal: 8 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  loadingRow: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/coach/components/GenerateDietButton.tsx
git commit -m "feat(coach): add GenerateDietButton with optimistic UX"
```

---

## Task 14 — Integrar `GenerateDietButton` no `CoachScreen` + navegação

**Files:**
- Modify: `src/features/coach/screens/CoachScreen.tsx`

- [ ] **Step 1 — Atualizar a screen pra renderizar o botão e navegar no sucesso**

Substituir o conteúdo de `src/features/coach/screens/CoachScreen.tsx`:

```tsx
import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '@navigation/types';
import { useCoachStore } from '../store';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { GenerateDietButton } from '../components/GenerateDietButton';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

export function CoachScreen(): React.JSX.Element {
  const { messages, isLoading, loadHistory, sendMessage } = useCoachStore();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const lastCoachWithFlag = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'coach' && messages[i].canGenerateDiet) return messages[i].id;
    }
    return null;
  }, [messages]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar size="md" emoji="🤖" />
        <View>
          <Text variant="heading2">Coach IA</Text>
          <Text variant="caption" color={colors.primary}>● online</Text>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <View>
            <ChatBubble
              message={item.content}
              role={item.role}
              timestamp={item.timestamp}
            />
            {item.id === lastCoachWithFlag && (
              <GenerateDietButton onSuccess={() => nav.navigate('Dashboard')} />
            )}
          </View>
        )}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
      />

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  chatContent: { padding: 16, paddingBottom: 8 },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/coach/screens/CoachScreen.tsx
git commit -m "feat(coach): render GenerateDietButton and navigate to Dashboard on success"
```

---

## Task 15 — Compor `DietPlanSection` no `DashboardScreen`

**Files:**
- Modify: `src/features/dashboard/screens/DashboardScreen.tsx`

- [ ] **Step 1 — Reescrever a screen integrando a dieta**

Substituir o conteúdo de `src/features/dashboard/screens/DashboardScreen.tsx`:

```tsx
import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useAuthStore } from '@features/auth/store';
import { useFoodLogStore } from '@features/food-log/store';
import { foodLogService } from '@shared/services/food-log.service';
import { useDietStore } from '@features/diet/store';
import { todayString } from '@shared/utils/date';
import { CalorieRing } from '../components/CalorieRing';
import { MacroCard } from '../components/MacroCard';
import { MealListItem } from '../components/MealListItem';
import { DietPlanSection } from '@features/diet/components/DietPlanSection';

const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_PROTEIN_GOAL = 150;
const DEFAULT_CARBS_GOAL = 250;
const DEFAULT_FAT_GOAL = 65;

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function todayLabel(): string {
  const d = new Date();
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

export function DashboardScreen(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const today = todayString();

  const foodLogMeals = useFoodLogStore((s) => s.mealsByDate[today] ?? []);
  const setMeals = useFoodLogStore((s) => s.setMeals);
  const isFoodLogLoading = useFoodLogStore((s) => s.isLoading);
  const setFoodLogLoading = useFoodLogStore((s) => s.setLoading);

  const plan = useDietStore((s) => s.plan);
  const loadCurrentDiet = useDietStore((s) => s.loadCurrent);

  useEffect(() => {
    if (useFoodLogStore.getState().mealsByDate[today] === undefined) {
      setFoodLogLoading(true);
      foodLogService.getMeals(today)
        .then((data) => setMeals(today, data))
        .catch(() => {})
        .finally(() => setFoodLogLoading(false));
    }
    if (useDietStore.getState().plan === undefined) {
      loadCurrentDiet();
    }
  }, [today, setFoodLogLoading, setMeals, loadCurrentDiet]);

  const completedPlannedMeals = (plan?.meals ?? []).filter((m) => m.completedAt !== null);
  const useDietForTotals = plan != null;

  const totals = useDietForTotals
    ? completedPlannedMeals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      )
    : foodLogMeals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

  const calorieGoal = plan?.totalCalories ?? DEFAULT_CALORIE_GOAL;
  const proteinGoal = plan?.totalProtein ?? DEFAULT_PROTEIN_GOAL;
  const carbsGoal = plan?.totalCarbs ?? DEFAULT_CARBS_GOAL;
  const fatGoal = plan?.totalFat ?? DEFAULT_FAT_GOAL;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Olá, {user?.name ?? 'visitante'} 👋</Text>
        <Text style={styles.date}>{todayLabel()}</Text>
      </View>

      <View style={styles.ringCard}>
        <CalorieRing current={totals.calories} goal={calorieGoal} size={110} />
        <View style={styles.ringInfo}>
          <Text style={styles.kcalLabel}>CALORIAS HOJE</Text>
          <Text style={styles.kcalValue}>{totals.calories}</Text>
          <Text style={styles.kcalGoal}>de {calorieGoal} kcal</Text>
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroCard label="Proteína" current={totals.protein} goal={proteinGoal} color="#FF8C42" />
        <View style={styles.macroGap} />
        <MacroCard label="Carboidratos" current={totals.carbs} goal={carbsGoal} color="#17A2B8" />
        <View style={styles.macroGap} />
        <MacroCard label="Gordura" current={totals.fat} goal={fatGoal} color="#FFC107" />
      </View>

      <DietPlanSection />

      {isFoodLogLoading ? (
        <Text style={styles.loadingText}>Carregando refeições...</Text>
      ) : foodLogMeals.length > 0 ? (
        <View style={styles.mealsCard}>
          <Text style={styles.mealsTitle}>REGISTRADAS HOJE (DIÁRIO LIVRE)</Text>
          {foodLogMeals.map((m) => <MealListItem key={m.id} meal={m} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: 16, paddingBottom: 32 },
  headerRow: { marginBottom: 20 },
  greeting: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  date: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  ringCard: { flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  ringInfo: {},
  kcalLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontFamily: typography.fontFamily.semiBold, letterSpacing: 0.5 },
  kcalValue: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.textPrimary },
  kcalGoal: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  macroRow: { flexDirection: 'row', marginBottom: 16 },
  macroGap: { width: 8 },
  mealsCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: 16 },
  mealsTitle: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold, color: colors.textSecondary, letterSpacing: 0.5, padding: 12, paddingBottom: 8 },
  loadingText: { color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
});
```

- [ ] **Step 2 — Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3 — Rodar todos os testes**

Run: `npx jest`
Expected: PASS em todo o conjunto. Se algum snapshot quebrar por causa do Dashboard, atualizar via `npx jest -u` e revisar visualmente.

- [ ] **Step 4 — Commit**

```bash
git add src/features/dashboard/screens/DashboardScreen.tsx
git commit -m "feat(dashboard): compose DietPlanSection and derive macros from plan"
```

---

## Task 16 — Limpar `useDietStore` no logout

**Files:**
- Modify: `src/features/auth/store.ts`

- [ ] **Step 1 — Atualizar `clearToken` pra zerar o store de dieta**

Substituir o conteúdo de `src/features/auth/store.ts`:

```ts
import { create } from 'zustand';
import { useDietStore } from '@features/diet/store';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  pendingAuth: { token: string; user: User } | null;
  setToken: (token: string, user: User) => void;
  setPendingAuth: (token: string, user: User) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  pendingAuth: null,
  setToken: (token, user) =>
    set({ token, user, isAuthenticated: true, pendingAuth: null }),
  setPendingAuth: (token, user) =>
    set({ pendingAuth: { token, user } }),
  clearToken: () => {
    useDietStore.getState().clear();
    set({ token: null, user: null, isAuthenticated: false, pendingAuth: null });
  },
}));
```

- [ ] **Step 2 — Type check + testes**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 3 — Commit**

```bash
git add src/features/auth/store.ts
git commit -m "chore(auth): clear diet store on logout"
```

---

## Task 17 — Testes de componente

**Files:**
- Create: `src/features/diet/components/MealPlanCard.test.tsx`
- Create: `src/features/diet/components/DietProgressHeader.test.tsx`
- Create: `src/features/diet/components/EmptyDietState.test.tsx`
- Create: `src/features/coach/components/GenerateDietButton.test.tsx`

- [ ] **Step 1 — `MealPlanCard.test.tsx`**

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MealPlanCard } from './MealPlanCard';
import type { PlannedMeal } from '@shared/services/diet.service';

const baseMeal: PlannedMeal = {
  id: 'm1', type: 'breakfast', title: 'Café',
  suggestedTime: '08:00',
  items: [{ name: 'Banana', quantity: 1, unit: 'un', calories: 100 }],
  calories: 400, protein: 20, carbs: 50, fat: 10, completedAt: null,
};

describe('MealPlanCard', () => {
  it('mostra "Marcar como concluída" quando completedAt é null', () => {
    const { getByText } = render(
      <MealPlanCard meal={baseMeal} isToggling={false} onToggleComplete={() => {}} />,
    );
    expect(getByText('Marcar como concluída')).toBeTruthy();
  });

  it('mostra "✓ Concluída" quando completedAt é setado', () => {
    const { getByText } = render(
      <MealPlanCard meal={{ ...baseMeal, completedAt: '2026-06-11T08:00:00Z' }} isToggling={false} onToggleComplete={() => {}} />,
    );
    expect(getByText('✓ Concluída')).toBeTruthy();
  });

  it('dispara onToggleComplete ao tocar no botão', () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <MealPlanCard meal={baseMeal} isToggling={false} onToggleComplete={onToggle} />,
    );
    fireEvent.press(getByText('Marcar como concluída'));
    expect(onToggle).toHaveBeenCalledWith('m1');
  });
});
```

- [ ] **Step 2 — `DietProgressHeader.test.tsx`**

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { DietProgressHeader } from './DietProgressHeader';

describe('DietProgressHeader', () => {
  it('mostra contagem correta', () => {
    const { getByText } = render(<DietProgressHeader completedCount={2} totalCount={4} />);
    expect(getByText('2 de 4 refeições concluídas')).toBeTruthy();
  });

  it('lida com totalCount zero sem dividir por zero', () => {
    const { getByText } = render(<DietProgressHeader completedCount={0} totalCount={0} />);
    expect(getByText('0 de 0 refeições concluídas')).toBeTruthy();
  });
});
```

- [ ] **Step 3 — `EmptyDietState.test.tsx`**

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyDietState } from './EmptyDietState';

describe('EmptyDietState', () => {
  it('modo padrão mostra CTA para Coach', () => {
    const { getByText } = render(<EmptyDietState onAction={() => {}} />);
    expect(getByText('Você ainda não tem uma dieta')).toBeTruthy();
    expect(getByText('Falar com o Coach')).toBeTruthy();
  });

  it('modo erro mostra CTA de retry', () => {
    const { getByText } = render(<EmptyDietState errorMode onAction={() => {}} />);
    expect(getByText('Não foi possível carregar sua dieta')).toBeTruthy();
    expect(getByText('Tentar novamente')).toBeTruthy();
  });

  it('dispara onAction ao tocar no CTA', () => {
    const onAction = jest.fn();
    const { getByText } = render(<EmptyDietState onAction={onAction} />);
    fireEvent.press(getByText('Falar com o Coach'));
    expect(onAction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4 — `GenerateDietButton.test.tsx`**

```tsx
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { GenerateDietButton } from './GenerateDietButton';
import { useDietStore } from '@features/diet/store';

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe('GenerateDietButton', () => {
  beforeEach(() => {
    useDietStore.setState({ plan: undefined, isGenerating: false, isLoading: false, togglingMealId: null });
  });

  it('renderiza estado idle', () => {
    const { getByText } = render(<GenerateDietButton onSuccess={() => {}} />);
    expect(getByText('✨ Gerar minha dieta agora')).toBeTruthy();
  });

  it('chama onSuccess quando generate resolve', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      generate: jest.fn().mockResolvedValue({ id: 'p1' }),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('✨ Gerar minha dieta agora'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('dispara Alert quando generate falha', async () => {
    const onSuccess = jest.fn();
    useDietStore.setState({
      generate: jest.fn().mockRejectedValue(new Error('boom')),
    } as never);
    const { getByText } = render(<GenerateDietButton onSuccess={onSuccess} />);
    fireEvent.press(getByText('✨ Gerar minha dieta agora'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5 — Rodar testes**

Run: `npx jest src/features/diet src/features/coach/components/GenerateDietButton.test.tsx`
Expected: PASS em todos os testes novos.

- [ ] **Step 6 — Commit**

```bash
git add src/features/diet/components/*.test.tsx src/features/coach/components/GenerateDietButton.test.tsx
git commit -m "test(diet): add component tests for cards, header, empty state and button"
```

---

## Task 18 — Verificação manual (web dev server)

**Files:** nenhum

- [ ] **Step 1 — Subir o dev server**

Run: `npm run web` (ou o script equivalente; ver `package.json`).
Expected: build limpo, app rodando em `http://localhost:3000`.

- [ ] **Step 2 — Smoke test do fluxo completo**

Checklist (manual):
- Login → cair no Dashboard.
- Dashboard sem dieta: `EmptyDietState` aparece com CTA "Falar com o Coach".
- Tocar no CTA → navega pra tab Coach.
- Mandar uma mensagem normal pro coach → recebe resposta sem botão.
- Mandar "pode gerar dieta" → resposta vem com `GenerateDietButton`.
- Clicar no botão → botão fica em "Gerando sua dieta..." → navega pro Dashboard.
- Dashboard mostra `DietProgressHeader` ("0 de 4 refeições concluídas") + 4 cards expandidos.
- Anel de calorias mostra `0 de 1900 kcal` (meta vem do `plan.totalCalories`).
- Tocar em "Marcar como concluída" em uma refeição → UI muda **na hora** (otimista) → progress header vai pra "1 de 4" → anel e macros sobem.
- Tocar de novo na mesma refeição → desmarca; tudo volta.
- Logout → entrar de novo: `loadCurrent` busca a dieta persistida no mock (a mesma instância no MSW).

- [ ] **Step 3 — Commit final (changelog opcional)**

Se você atualizou algum doc/CHANGELOG, comitar agora; senão pular.

---

## Verificação contra o spec

| Item da spec | Cobertura |
|---|---|
| §3.1 estrutura de pastas | T1, T2, T3, T4, T5–T10, T13 |
| §4.1 tipos compartilhados | T1 |
| §4.2 extensão `CoachMessage` | T11 |
| §5 endpoints | T1 (service) + T2 (mock) |
| §6.1 store interface | T3 |
| §6.2 toggle otimista | T3 |
| §6.3 `useDiet` | T4 |
| §6.4 extensão coach store | T12 |
| §6.5 logout limpa diet store | T16 |
| §7.1 `DietPlanSection` | T10 |
| §7.2 `MealPlanCard` | T7 |
| §7.3 `MealItemRow` | T6 |
| §7.4 `MacroChips` | T5 |
| §7.5 `DietProgressHeader` | T8 |
| §7.6 `EmptyDietState` | T9 |
| §7.7 `GenerateDietButton` | T13 |
| §7.8 mudanças no `DashboardScreen` | T15 |
| §8 navegação | T14 |
| §9 estados de loading & erro | T9 (skeleton + empty/erro), T10, T13 |
| §10 testes (store) | T3 (diet store), T12 (coach store) |
| §10 testes (componentes) | T17 |
| §12 mock como mitigação | T2 |
