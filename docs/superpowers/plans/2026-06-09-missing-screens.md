# Missing Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Dashboard, FoodLog, Scanner and Profile screens with full UI and data wiring, then serve the app on localhost:3000 via Webpack.

**Architecture:** FoodLog state lives in a shared Zustand store (`useFoodLogStore`) used by Dashboard, FoodLog and Scanner. Profile has its own `useProfile` hook that fetches weekly data on mount. The Scanner screen uses a web file-input disguised as a camera viewfinder, calling the mock `/scanner/analyze` endpoint. All API calls go through existing services in `src/shared/services/`.

**Tech Stack:** React Native 0.76 + React Native Web, Zustand 4, Axios 1.7, MSW 2 (mocks), Jest + @testing-library/react-native, Webpack 5 (web dev server on port 3000)

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/shared/utils/date.ts` | Date helpers: `dateToString`, `todayString`, `last7Days`, `formatChipLabel`, `getMealGroup` |
| `src/features/food-log/store.ts` | Zustand store: `mealsByDate`, `selectedDate`, CRUD actions |
| `src/features/food-log/hooks/useFoodLog.ts` | Hook: fetch on date change, add, delete |
| `src/features/food-log/components/DateChip.tsx` | Chip button for date navigation |
| `src/features/food-log/components/DayMacroSummary.tsx` | Row of totals: kcal, prot, carbs, gord |
| `src/features/food-log/components/FoodLogItem.tsx` | Meal row with delete button |
| `src/features/food-log/components/MealSection.tsx` | Group of `FoodLogItem`s under a section title |
| `src/features/food-log/components/AddMealModal.tsx` | Bottom sheet modal with form |
| `src/features/dashboard/components/CalorieRing.tsx` | Circular progress using `conic-gradient` on web |
| `src/features/dashboard/components/MacroCard.tsx` | Mini card with colored progress bar |
| `src/features/dashboard/components/MealListItem.tsx` | Read-only meal row for Dashboard |
| `src/features/scanner/components/ScannerViewfinder.tsx` | Web file-input styled as camera frame |
| `src/features/scanner/components/ConfidenceBadge.tsx` | Colored badge showing confidence % |
| `src/features/scanner/components/ScanResultCard.tsx` | Result card with macros + action buttons |
| `src/features/profile/hooks/useProfile.ts` | Fetches last-7-days meals, computes streak + weekly data |
| `src/features/profile/components/ProfileHeader.tsx` | Avatar + name + email |
| `src/features/profile/components/StreakBadge.tsx` | 🔥 N dias seguidos badge |
| `src/features/profile/components/WeeklyCalorieChart.tsx` | 7-bar View-based chart |
| `src/features/profile/components/ProfileMenuItem.tsx` | Tappable menu row with chevron |

### Modified files
| File | Change |
|------|--------|
| `src/features/food-log/screens/FoodLogScreen.tsx` | Replace placeholder with full screen |
| `src/features/dashboard/screens/DashboardScreen.tsx` | Replace placeholder with full screen |
| `src/features/scanner/screens/ScannerScreen.tsx` | Replace placeholder with full screen |
| `src/features/profile/screens/ProfileScreen.tsx` | Replace placeholder with full screen |

---

## Task 1 — Date utilities + FoodLog store

**Files:**
- Create: `src/shared/utils/date.ts`
- Create: `src/features/food-log/store.ts`
- Test: `src/shared/utils/date.test.ts`
- Test: `src/features/food-log/store.test.ts`

- [ ] **Step 1.1 — Write failing test for date utilities**

```ts
// src/shared/utils/date.test.ts
import { dateToString, todayString, last7Days, formatChipLabel, getMealGroup } from './date';

describe('dateToString', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(dateToString(new Date(2026, 5, 9))).toBe('2026-06-09');
  });
});

describe('last7Days', () => {
  it('returns 7 items with today first', () => {
    const days = last7Days();
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(todayString());
  });
});

describe('formatChipLabel', () => {
  it('returns "Hoje" for today', () => {
    expect(formatChipLabel(todayString())).toBe('Hoje');
  });
  it('returns "Ontem" for yesterday', () => {
    const yesterday = dateToString(new Date(Date.now() - 86400000));
    expect(formatChipLabel(yesterday)).toBe('Ontem');
  });
  it('returns "9 Jun" for 2026-06-09', () => {
    expect(formatChipLabel('2026-06-09')).toBe('9 Jun');
  });
});

describe('getMealGroup', () => {
  it('maps 08:00 to Café da manhã', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 8, 0).toISOString())).toBe('Café da manhã');
  });
  it('maps 12:00 to Almoço', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 12, 0).toISOString())).toBe('Almoço');
  });
  it('maps 16:00 to Lanche', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 16, 0).toISOString())).toBe('Lanche');
  });
  it('maps 20:00 to Jantar', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 20, 0).toISOString())).toBe('Jantar');
  });
});
```

- [ ] **Step 1.2 — Run test, confirm it fails**

```bash
npx jest src/shared/utils/date.test.ts --no-coverage
```
Expected: `Cannot find module './date'`

- [ ] **Step 1.3 — Create date utilities**

```ts
// src/shared/utils/date.ts
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function dateToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return dateToString(new Date());
}

export function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dateToString(d);
  });
}

export function formatChipLabel(dateStr: string): string {
  const today = todayString();
  const yesterday = dateToString(new Date(Date.now() - 86400000));
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export type MealGroup = 'Café da manhã' | 'Almoço' | 'Lanche' | 'Jantar';

export function getMealGroup(loggedAt: string): MealGroup {
  const hour = new Date(loggedAt).getHours();
  if (hour >= 5 && hour < 11) return 'Café da manhã';
  if (hour >= 11 && hour < 15) return 'Almoço';
  if (hour >= 15 && hour < 18) return 'Lanche';
  return 'Jantar';
}
```

- [ ] **Step 1.4 — Run test, confirm it passes**

```bash
npx jest src/shared/utils/date.test.ts --no-coverage
```
Expected: all 8 tests PASS

- [ ] **Step 1.5 — Write failing test for FoodLog store**

```ts
// src/features/food-log/store.test.ts
import { useFoodLogStore } from './store';

const meal1 = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };
const meal2 = { id: 'm2', name: 'Salada', calories: 280, protein: 30, carbs: 12, fat: 10, loggedAt: new Date().toISOString() };

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
});

describe('useFoodLogStore', () => {
  it('setMeals popula a data correta', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1]);
    expect(useFoodLogStore.getState().mealsByDate['2026-06-09']).toHaveLength(1);
  });

  it('addMeal adiciona à data correta', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1]);
    useFoodLogStore.getState().addMeal('2026-06-09', meal2);
    expect(useFoodLogStore.getState().mealsByDate['2026-06-09']).toHaveLength(2);
  });

  it('removeMeal remove pelo id', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1, meal2]);
    useFoodLogStore.getState().removeMeal('2026-06-09', 'm1');
    const meals = useFoodLogStore.getState().mealsByDate['2026-06-09'];
    expect(meals).toHaveLength(1);
    expect(meals[0].id).toBe('m2');
  });

  it('setSelectedDate atualiza a data selecionada', () => {
    useFoodLogStore.getState().setSelectedDate('2026-06-08');
    expect(useFoodLogStore.getState().selectedDate).toBe('2026-06-08');
  });
});
```

- [ ] **Step 1.6 — Run test, confirm it fails**

```bash
npx jest src/features/food-log/store.test.ts --no-coverage
```
Expected: `Cannot find module './store'`

- [ ] **Step 1.7 — Create FoodLog store**

```ts
// src/features/food-log/store.ts
import { create } from 'zustand';
import { Meal } from '@shared/services/food-log.service';
import { todayString } from '@shared/utils/date';

interface FoodLogState {
  mealsByDate: Record<string, Meal[]>;
  selectedDate: string;
  isLoading: boolean;
  setSelectedDate: (date: string) => void;
  setMeals: (date: string, meals: Meal[]) => void;
  addMeal: (date: string, meal: Meal) => void;
  removeMeal: (date: string, id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useFoodLogStore = create<FoodLogState>((set) => ({
  mealsByDate: {},
  selectedDate: todayString(),
  isLoading: false,
  setSelectedDate: (date) => set({ selectedDate: date }),
  setMeals: (date, meals) =>
    set((s) => ({ mealsByDate: { ...s.mealsByDate, [date]: meals } })),
  addMeal: (date, meal) =>
    set((s) => ({
      mealsByDate: {
        ...s.mealsByDate,
        [date]: [...(s.mealsByDate[date] ?? []), meal],
      },
    })),
  removeMeal: (date, id) =>
    set((s) => ({
      mealsByDate: {
        ...s.mealsByDate,
        [date]: (s.mealsByDate[date] ?? []).filter((m) => m.id !== id),
      },
    })),
  setLoading: (loading) => set({ isLoading: loading }),
}));
```

- [ ] **Step 1.8 — Run test, confirm it passes**

```bash
npx jest src/features/food-log/store.test.ts --no-coverage
```
Expected: all 4 tests PASS

- [ ] **Step 1.9 — Commit**

```bash
git add src/shared/utils/date.ts src/shared/utils/date.test.ts src/features/food-log/store.ts src/features/food-log/store.test.ts
git commit -m "feat: add date utilities and food-log Zustand store"
```

---

## Task 2 — useFoodLog hook

**Files:**
- Create: `src/features/food-log/hooks/useFoodLog.ts`
- Test: `src/features/food-log/hooks/useFoodLog.test.ts`

- [ ] **Step 2.1 — Write failing test**

```ts
// src/features/food-log/hooks/useFoodLog.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFoodLog } from './useFoodLog';
import { useFoodLogStore } from '../store';

const mockMeal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };
const mockNewMeal = { id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString() };

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([mockMeal]),
    addMeal: jest.fn().mockResolvedValue(mockNewMeal),
    deleteMeal: jest.fn().mockResolvedValue({ deleted: true }),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
});

describe('useFoodLog', () => {
  it('carrega refeições ao montar', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    expect(result.current.meals[0].name).toBe('Frango');
  });

  it('não faz fetch se a data já está em cache', async () => {
    const { foodLogService } = require('@shared/services/food-log.service');
    useFoodLogStore.setState({ mealsByDate: { '2026-06-09': [mockMeal] }, selectedDate: '2026-06-09', isLoading: false });
    renderHook(() => useFoodLog());
    await act(async () => {});
    expect(foodLogService.getMeals).not.toHaveBeenCalled();
  });

  it('handleAddMeal adiciona refeição ao store', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    await act(() => result.current.handleAddMeal({ name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5 }));
    expect(result.current.meals).toHaveLength(2);
  });

  it('handleDeleteMeal remove refeição do store', async () => {
    const { result } = renderHook(() => useFoodLog());
    await waitFor(() => expect(result.current.meals).toHaveLength(1));
    await act(() => result.current.handleDeleteMeal('m1'));
    expect(result.current.meals).toHaveLength(0);
  });
});
```

- [ ] **Step 2.2 — Run test, confirm it fails**

```bash
npx jest src/features/food-log/hooks/useFoodLog.test.ts --no-coverage
```
Expected: `Cannot find module './useFoodLog'`

- [ ] **Step 2.3 — Create useFoodLog hook**

```ts
// src/features/food-log/hooks/useFoodLog.ts
import { useEffect } from 'react';
import { foodLogService, AddMealPayload } from '@shared/services/food-log.service';
import { useFoodLogStore } from '../store';

export function useFoodLog() {
  const store = useFoodLogStore();
  const meals = store.mealsByDate[store.selectedDate] ?? [];

  useEffect(() => {
    if (store.mealsByDate[store.selectedDate] !== undefined) return;
    store.setLoading(true);
    foodLogService
      .getMeals(store.selectedDate)
      .then((data) => store.setMeals(store.selectedDate, data))
      .finally(() => store.setLoading(false));
  }, [store.selectedDate]);

  async function handleAddMeal(data: AddMealPayload): Promise<void> {
    const meal = await foodLogService.addMeal(data);
    store.addMeal(store.selectedDate, meal);
  }

  async function handleDeleteMeal(id: string): Promise<void> {
    await foodLogService.deleteMeal(id);
    store.removeMeal(store.selectedDate, id);
  }

  return {
    meals,
    isLoading: store.isLoading,
    selectedDate: store.selectedDate,
    setSelectedDate: store.setSelectedDate,
    handleAddMeal,
    handleDeleteMeal,
  };
}
```

- [ ] **Step 2.4 — Run test, confirm it passes**

```bash
npx jest src/features/food-log/hooks/useFoodLog.test.ts --no-coverage
```
Expected: all 4 tests PASS

- [ ] **Step 2.5 — Commit**

```bash
git add src/features/food-log/hooks/useFoodLog.ts src/features/food-log/hooks/useFoodLog.test.ts
git commit -m "feat: add useFoodLog hook with fetch, add and delete"
```

---

## Task 3 — FoodLog components

**Files:**
- Create: `src/features/food-log/components/DateChip.tsx`
- Create: `src/features/food-log/components/DayMacroSummary.tsx`
- Create: `src/features/food-log/components/FoodLogItem.tsx`
- Create: `src/features/food-log/components/MealSection.tsx`
- Create: `src/features/food-log/components/AddMealModal.tsx`
- Test: `src/features/food-log/components/DateChip.test.tsx`
- Test: `src/features/food-log/components/FoodLogItem.test.tsx`

- [ ] **Step 3.1 — Write failing tests**

```tsx
// src/features/food-log/components/DateChip.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DateChip } from './DateChip';

describe('DateChip', () => {
  it('renderiza o label', () => {
    const { getByText } = render(<DateChip label="Hoje" selected={false} onPress={() => {}} />);
    expect(getByText('Hoje')).toBeTruthy();
  });

  it('chama onPress ao ser pressionado', () => {
    const onPress = jest.fn();
    const { getByText } = render(<DateChip label="Hoje" selected={false} onPress={onPress} />);
    fireEvent.press(getByText('Hoje'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

```tsx
// src/features/food-log/components/FoodLogItem.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FoodLogItem } from './FoodLogItem';

const meal = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };

describe('FoodLogItem', () => {
  it('renderiza nome e calorias', () => {
    const { getByText } = render(<FoodLogItem meal={meal} onDelete={() => {}} />);
    expect(getByText('Frango')).toBeTruthy();
    expect(getByText('450 kcal')).toBeTruthy();
  });

  it('chama onDelete com o id correto', () => {
    const onDelete = jest.fn();
    const { getByTestId } = render(<FoodLogItem meal={meal} onDelete={onDelete} />);
    fireEvent.press(getByTestId('delete-m1'));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });
});
```

- [ ] **Step 3.2 — Run tests, confirm they fail**

```bash
npx jest src/features/food-log/components/DateChip.test.tsx src/features/food-log/components/FoodLogItem.test.tsx --no-coverage
```
Expected: `Cannot find module './DateChip'` and `Cannot find module './FoodLogItem'`

- [ ] **Step 3.3 — Create DateChip**

```tsx
// src/features/food-log/components/DateChip.tsx
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function DateChip({ label, selected, onPress }: Props): React.JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.textSecondary,
  },
  labelSelected: { color: colors.white },
});
```

- [ ] **Step 3.4 — Create DayMacroSummary**

```tsx
// src/features/food-log/components/DayMacroSummary.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meals: Meal[] }

export function DayMacroSummary({ meals }: Props): React.JSX.Element {
  const t = meals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return (
    <View style={styles.container}>
      {[
        { label: 'kcal', value: String(t.calories), color: colors.primary },
        { label: 'prot.', value: `${t.protein}g`, color: '#FF8C42' },
        { label: 'carbs', value: `${t.carbs}g`, color: '#17A2B8' },
        { label: 'gord.', value: `${t.fat}g`, color: '#FFC107' },
      ].map((item, i, arr) => (
        <React.Fragment key={item.label}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: item.color }]}>{item.value}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
          {i < arr.length - 1 && <View style={styles.divider} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  stat: { alignItems: 'center' },
  value: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold },
  label: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  divider: { width: 1, height: 24, backgroundColor: colors.border },
});
```

- [ ] **Step 3.5 — Create FoodLogItem**

```tsx
// src/features/food-log/components/FoodLogItem.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meal: Meal; onDelete: (id: string) => void }

export function FoodLogItem({ meal, onDelete }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.macros}>P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.calories}>{meal.calories} kcal</Text>
        <TouchableOpacity onPress={() => onDelete(meal.id)} style={styles.deleteBtn} testID={`delete-${meal.id}`}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },
  macros: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  deleteBtn: { padding: 4 },
  deleteText: { fontSize: 12, color: colors.error },
});
```

- [ ] **Step 3.6 — Create MealSection**

```tsx
// src/features/food-log/components/MealSection.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';
import { FoodLogItem } from './FoodLogItem';

interface Props { title: string; meals: Meal[]; onDelete: (id: string) => void }

export function MealSection({ title, meals, onDelete }: Props): React.JSX.Element | null {
  if (meals.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.card}>
        {meals.map((meal) => <FoodLogItem key={meal.id} meal={meal} onDelete={onDelete} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
```

- [ ] **Step 3.7 — Create AddMealModal**

```tsx
// src/features/food-log/components/AddMealModal.tsx
import React, { useState } from 'react';
import { Modal, View, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button } from '@shared/components';
import { colors, typography } from '@theme';
import { AddMealPayload } from '@shared/services/food-log.service';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AddMealPayload) => Promise<void>;
}

export function AddMealModal({ visible, onClose, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !calories) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), calories: Number(calories), protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0 });
      setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Registrar refeição</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput style={styles.input} placeholder="Nome da refeição" placeholderTextColor={colors.textDisabled} value={name} onChangeText={setName} testID="meal-name-input" />
            <TextInput style={styles.input} placeholder="Calorias (kcal)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={calories} onChangeText={setCalories} testID="meal-calories-input" />
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.inputHalf]} placeholder="Proteína (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={protein} onChangeText={setProtein} />
              <TextInput style={[styles.input, styles.inputHalf]} placeholder="Carbs (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
            </View>
            <TextInput style={styles.input} placeholder="Gordura (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={fat} onChangeText={setFat} />
            <Button onPress={handleSubmit} loading={loading} style={styles.submitBtn}>Salvar refeição</Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: '80%' as any },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  closeBtn: { fontSize: 18, color: colors.textSecondary, padding: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: typography.fontSize.base, color: colors.textPrimary, marginBottom: 12, fontFamily: typography.fontFamily.regular, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  submitBtn: { marginTop: 8 },
});
```

- [ ] **Step 3.8 — Run component tests, confirm they pass**

```bash
npx jest src/features/food-log/components/DateChip.test.tsx src/features/food-log/components/FoodLogItem.test.tsx --no-coverage
```
Expected: all 4 tests PASS

- [ ] **Step 3.9 — Commit**

```bash
git add src/features/food-log/components/
git commit -m "feat: add FoodLog UI components (DateChip, DayMacroSummary, FoodLogItem, MealSection, AddMealModal)"
```

---

## Task 4 — FoodLogScreen

**Files:**
- Modify: `src/features/food-log/screens/FoodLogScreen.tsx`
- Test: `src/features/food-log/screens/FoodLogScreen.test.tsx`

- [ ] **Step 4.1 — Write failing test**

```tsx
// src/features/food-log/screens/FoodLogScreen.test.tsx
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { FoodLogScreen } from './FoodLogScreen';
import { useFoodLogStore } from '../store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
    addMeal: jest.fn().mockResolvedValue({ id: 'm2', name: 'Novo', calories: 300, protein: 20, carbs: 30, fat: 5, loggedAt: new Date().toISOString() }),
    deleteMeal: jest.fn().mockResolvedValue({ deleted: true }),
  },
}));

beforeEach(() => useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false }));

describe('FoodLogScreen', () => {
  it('renderiza o título', () => {
    const { getByText } = render(<FoodLogScreen />);
    expect(getByText('Diário alimentar')).toBeTruthy();
  });

  it('exibe "Hoje" como chip selecionado', () => {
    const { getAllByText } = render(<FoodLogScreen />);
    expect(getAllByText('Hoje').length).toBeGreaterThan(0);
  });

  it('exibe refeições após carregamento', async () => {
    const { findByText } = render(<FoodLogScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });
});
```

- [ ] **Step 4.2 — Run test, confirm it fails**

```bash
npx jest src/features/food-log/screens/FoodLogScreen.test.tsx --no-coverage
```
Expected: tests fail (placeholder screen has no "Diário alimentar" + date chips)

- [ ] **Step 4.3 — Implement FoodLogScreen**

```tsx
// src/features/food-log/screens/FoodLogScreen.tsx
import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useFoodLog } from '../hooks/useFoodLog';
import { DateChip } from '../components/DateChip';
import { DayMacroSummary } from '../components/DayMacroSummary';
import { MealSection } from '../components/MealSection';
import { AddMealModal } from '../components/AddMealModal';
import { last7Days, formatChipLabel, getMealGroup } from '@shared/utils/date';

const GROUPS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar'] as const;

export function FoodLogScreen(): React.JSX.Element {
  const { meals, isLoading, selectedDate, setSelectedDate, handleAddMeal, handleDeleteMeal } = useFoodLog();
  const [modalVisible, setModalVisible] = useState(false);
  const dates = last7Days();

  const grouped = GROUPS.reduce<Record<string, typeof meals>>((acc, g) => {
    acc[g] = meals.filter((m) => getMealGroup(m.loggedAt) === g);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Diário alimentar</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Adicionar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        {dates.map((d) => (
          <DateChip key={d} label={formatChipLabel(d)} selected={d === selectedDate} onPress={() => setSelectedDate(d)} />
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <DayMacroSummary meals={meals} />
          <View style={styles.sections}>
            {GROUPS.map((g) => (
              <MealSection key={g} title={g} meals={grouped[g] ?? []} onDelete={handleDeleteMeal} />
            ))}
          </View>
          {meals.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma refeição registrada neste dia.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleAddMeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  addBtnText: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.white },
  chips: { maxHeight: 44, marginBottom: 4 },
  chipsContent: { paddingHorizontal: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },
  sections: { marginTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.textSecondary, fontSize: typography.fontSize.sm },
});
```

- [ ] **Step 4.4 — Run test, confirm it passes**

```bash
npx jest src/features/food-log/screens/FoodLogScreen.test.tsx --no-coverage
```
Expected: all 3 tests PASS

- [ ] **Step 4.5 — Commit**

```bash
git add src/features/food-log/screens/FoodLogScreen.tsx src/features/food-log/screens/FoodLogScreen.test.tsx
git commit -m "feat: implement FoodLogScreen with date navigation and meal CRUD"
```

---

## Task 5 — Dashboard components + DashboardScreen

**Files:**
- Create: `src/features/dashboard/components/CalorieRing.tsx`
- Create: `src/features/dashboard/components/MacroCard.tsx`
- Create: `src/features/dashboard/components/MealListItem.tsx`
- Modify: `src/features/dashboard/screens/DashboardScreen.tsx`
- Test: `src/features/dashboard/screens/DashboardScreen.test.tsx`

- [ ] **Step 5.1 — Create CalorieRing**

```tsx
// src/features/dashboard/components/CalorieRing.tsx
import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { current: number; goal: number; size?: number }

export function CalorieRing({ current, goal, size = 120 }: Props): React.JSX.Element {
  const percent = goal > 0 ? Math.min(current / goal, 1) : 0;
  const angle = Math.round(percent * 360);
  const strokeWidth = Math.round(size * 0.085);
  const innerSize = size - strokeWidth * 2;

  const webStyle = Platform.OS === 'web'
    ? ({ backgroundImage: `conic-gradient(${colors.primary} ${angle}deg, ${colors.border} ${angle}deg)` } as object)
    : {};

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2 },
        Platform.OS !== 'web' && { borderWidth: strokeWidth, borderColor: colors.border },
        webStyle,
      ]} />
      <View style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}>
        <Text style={styles.pct}>{Math.round(percent * 100)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
});
```

- [ ] **Step 5.2 — Create MacroCard**

```tsx
// src/features/dashboard/components/MacroCard.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { label: string; current: number; goal: number; unit?: string; color: string }

export function MacroCard({ label, current, goal, unit = 'g', color }: Props): React.JSX.Element {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{current}{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10 },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginBottom: 6, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  label: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  value: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, marginTop: 2 },
});
```

- [ ] **Step 5.3 — Create MealListItem**

```tsx
// src/features/dashboard/components/MealListItem.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meal: Meal }

export function MealListItem({ meal }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{meal.name}</Text>
        <Text style={styles.macros}>P: {meal.protein}g · C: {meal.carbs}g · G: {meal.fat}g</Text>
      </View>
      <Text style={styles.calories}>{meal.calories} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  info: { flex: 1 },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },
  macros: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
});
```

- [ ] **Step 5.4 — Write failing test for DashboardScreen**

```tsx
// src/features/dashboard/screens/DashboardScreen.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from './DashboardScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'João', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('DashboardScreen', () => {
  it('renderiza saudação com o nome do usuário', () => {
    const { getByText } = render(<DashboardScreen />);
    expect(getByText(/João/)).toBeTruthy();
  });

  it('exibe refeições do dia após carregamento', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('Frango')).toBeTruthy();
  });

  it('exibe label REFEIÇÕES DE HOJE', async () => {
    const { findByText } = render(<DashboardScreen />);
    expect(await findByText('REFEIÇÕES DE HOJE')).toBeTruthy();
  });
});
```

- [ ] **Step 5.5 — Run test, confirm it fails**

```bash
npx jest src/features/dashboard/screens/DashboardScreen.test.tsx --no-coverage
```
Expected: fails (placeholder has no greeting or refeições)

- [ ] **Step 5.6 — Implement DashboardScreen**

> **Note:** Dashboard fetches today's date directly (NOT via `useFoodLog`'s `selectedDate`) so it always shows today even if the user navigated to a past date in the FoodLog tab.

```tsx
// src/features/dashboard/screens/DashboardScreen.tsx
import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useAuthStore } from '@features/auth/store';
import { useFoodLogStore } from '@features/food-log/store';
import { foodLogService } from '@shared/services/food-log.service';
import { todayString } from '@shared/utils/date';
import { CalorieRing } from '../components/CalorieRing';
import { MacroCard } from '../components/MacroCard';
import { MealListItem } from '../components/MealListItem';

const CALORIE_GOAL = 2000;
const PROTEIN_GOAL = 150;
const CARBS_GOAL = 250;
const FAT_GOAL = 65;

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function todayLabel(): string {
  const d = new Date();
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

export function DashboardScreen(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const today = todayString();
  const meals = useFoodLogStore((s) => s.mealsByDate[today] ?? []);
  const setMeals = useFoodLogStore((s) => s.setMeals);
  const isLoading = useFoodLogStore((s) => s.isLoading);
  const setLoading = useFoodLogStore((s) => s.setLoading);

  useEffect(() => {
    if (useFoodLogStore.getState().mealsByDate[today] !== undefined) return;
    setLoading(true);
    foodLogService.getMeals(today)
      .then((data) => setMeals(today, data))
      .finally(() => setLoading(false));
  }, [today]);

  const totals = meals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Olá, {user?.name ?? 'visitante'} 👋</Text>
        <Text style={styles.date}>{todayLabel()}</Text>
      </View>

      <View style={styles.ringCard}>
        <CalorieRing current={totals.calories} goal={CALORIE_GOAL} size={110} />
        <View style={styles.ringInfo}>
          <Text style={styles.kcalLabel}>CALORIAS HOJE</Text>
          <Text style={styles.kcalValue}>{totals.calories}</Text>
          <Text style={styles.kcalGoal}>de {CALORIE_GOAL} kcal</Text>
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroCard label="Proteína" current={totals.protein} goal={PROTEIN_GOAL} color="#FF8C42" />
        <View style={styles.macroGap} />
        <MacroCard label="Carboidratos" current={totals.carbs} goal={CARBS_GOAL} color="#17A2B8" />
        <View style={styles.macroGap} />
        <MacroCard label="Gordura" current={totals.fat} goal={FAT_GOAL} color="#FFC107" />
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Carregando refeições...</Text>
      ) : meals.length > 0 ? (
        <View style={styles.mealsCard}>
          <Text style={styles.mealsTitle}>REFEIÇÕES DE HOJE</Text>
          {meals.map((m) => <MealListItem key={m.id} meal={m} />)}
        </View>
      ) : (
        <View style={styles.emptyMeals}>
          <Text style={styles.emptyText}>Nenhuma refeição registrada hoje.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: 16 },
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
  mealsCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  mealsTitle: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold, color: colors.textSecondary, letterSpacing: 0.5, padding: 12, paddingBottom: 8 },
  loadingText: { color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
  emptyMeals: { alignItems: 'center', paddingTop: 24 },
  emptyText: { color: colors.textSecondary, fontSize: typography.fontSize.sm },
});
```

- [ ] **Step 5.7 — Run test, confirm it passes**

```bash
npx jest src/features/dashboard/screens/DashboardScreen.test.tsx --no-coverage
```
Expected: all 3 tests PASS

- [ ] **Step 5.8 — Commit**

```bash
git add src/features/dashboard/
git commit -m "feat: implement DashboardScreen with CalorieRing, MacroCard and meal list"
```

---

## Task 6 — Scanner components + ScannerScreen

**Files:**
- Create: `src/features/scanner/components/ScannerViewfinder.tsx`
- Create: `src/features/scanner/components/ConfidenceBadge.tsx`
- Create: `src/features/scanner/components/ScanResultCard.tsx`
- Modify: `src/features/scanner/screens/ScannerScreen.tsx`
- Test: `src/features/scanner/screens/ScannerScreen.test.tsx`

- [ ] **Step 6.1 — Create ScannerViewfinder**

```tsx
// src/features/scanner/components/ScannerViewfinder.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { onPickImage: (uri: string) => void; isAnalyzing: boolean }

export function ScannerViewfinder({ onPickImage, isAnalyzing }: Props): React.JSX.Element {
  function handlePress() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onPickImage(URL.createObjectURL(file));
    };
    input.click();
  }

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} disabled={isAnalyzing} activeOpacity={0.8} testID="scanner-viewfinder">
      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
        <Text style={styles.hint}>{isAnalyzing ? 'Analisando...' : 'Toque para escolher uma foto'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const C = 20;
const B = 3;

const styles = StyleSheet.create({
  container: { backgroundColor: '#1A1A2E', borderRadius: 16, height: 220, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: typography.fontSize.xs, textAlign: 'center' },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: B, borderLeftWidth: B, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: B, borderRightWidth: B, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: B, borderLeftWidth: B, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: B, borderRightWidth: B, borderBottomRightRadius: 4 },
});
```

- [ ] **Step 6.2 — Create ConfidenceBadge**

```tsx
// src/features/scanner/components/ConfidenceBadge.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { confidence: number }

export function ConfidenceBadge({ confidence }: Props): React.JSX.Element {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.85 ? colors.success : confidence >= 0.6 ? colors.warning : colors.error;
  return (
    <View style={[styles.badge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{pct}% de confiança</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  text: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.semiBold },
});
```

- [ ] **Step 6.3 — Create ScanResultCard**

```tsx
// src/features/scanner/components/ScanResultCard.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from '@shared/components';
import { colors, typography } from '@theme';
import { ScanResult } from '@shared/services/scanner.service';
import { ConfidenceBadge } from './ConfidenceBadge';

interface Props { result: ScanResult; onAdd: () => void; onReset: () => void }

export function ScanResultCard({ result, onAdd, onReset }: Props): React.JSX.Element {
  return (
    <View style={styles.card} testID="scan-result-card">
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{result.name}</Text>
          <ConfidenceBadge confidence={result.confidence} />
        </View>
        <Text style={styles.calories}>{result.calories}<Text style={styles.unit}> kcal</Text></Text>
      </View>
      <View style={styles.macros}>
        {[
          { label: 'Proteína', value: `${result.protein}g`, color: '#FF8C42' },
          { label: 'Carboidratos', value: `${result.carbs}g`, color: '#17A2B8' },
          { label: 'Gordura', value: `${result.fat}g`, color: '#FFC107' },
        ].map((m) => (
          <View key={m.label} style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: m.color }]}>{m.value}</Text>
            <Text style={styles.macroLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onReset} style={styles.resetBtn}>Escanear outro</Button>
        <Button onPress={onAdd} style={styles.addBtn}>+ Adicionar ao diário</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  name: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.bold, color: colors.textPrimary, marginBottom: 6 },
  calories: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.primary },
  unit: { fontSize: typography.fontSize.sm, color: colors.textSecondary, fontFamily: typography.fontFamily.regular },
  macros: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 16 },
  macroItem: { alignItems: 'center' },
  macroValue: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold },
  macroLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  resetBtn: { flex: 1 },
  addBtn: { flex: 2 },
});
```

- [ ] **Step 6.4 — Write failing test for ScannerScreen**

```tsx
// src/features/scanner/screens/ScannerScreen.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ScannerScreen } from './ScannerScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn().mockResolvedValue({ name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, confidence: 0.92 }) },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: jest.fn().mockResolvedValue({ id: 'x', name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, loggedAt: new Date().toISOString() }) },
}));

describe('ScannerScreen', () => {
  it('renderiza título e viewfinder', () => {
    const { getByText, getByTestId } = render(<ScannerScreen />);
    expect(getByText('Scanner de alimentos')).toBeTruthy();
    expect(getByTestId('scanner-viewfinder')).toBeTruthy();
  });
});
```

- [ ] **Step 6.5 — Run test, confirm it fails**

```bash
npx jest src/features/scanner/screens/ScannerScreen.test.tsx --no-coverage
```
Expected: fails (placeholder has no "Scanner de alimentos")

- [ ] **Step 6.6 — Implement ScannerScreen**

```tsx
// src/features/scanner/screens/ScannerScreen.tsx
import React, { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { scannerService, ScanResult } from '@shared/services/scanner.service';
import { foodLogService } from '@shared/services/food-log.service';
import { useFoodLogStore } from '@features/food-log/store';
import { todayString } from '@shared/utils/date';
import { ScannerViewfinder } from '../components/ScannerViewfinder';
import { ScanResultCard } from '../components/ScanResultCard';

type ScanState = 'idle' | 'analyzing' | 'result' | 'error';

export function ScannerScreen(): React.JSX.Element {
  const [state, setState] = useState<ScanState>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const addMeal = useFoodLogStore((s) => s.addMeal);
  const navigation = useNavigation();

  async function handlePickImage(uri: string) {
    setState('analyzing');
    try {
      const data = await scannerService.analyzePhoto(uri);
      setResult(data);
      setState('result');
    } catch {
      setState('error');
    }
  }

  async function handleAddToDiary() {
    if (!result) return;
    try {
      const meal = await foodLogService.addMeal({ name: result.name, calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat });
      addMeal(todayString(), meal);
      Alert.alert('Adicionado!', `${result.name} foi adicionado ao seu diário.`);
      handleReset();
      navigation.navigate('FoodLog' as never);
    } catch {
      Alert.alert('Erro', 'Não foi possível adicionar a refeição.');
    }
  }

  function handleReset() {
    setState('idle');
    setResult(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scanner de alimentos</Text>
      <Text style={styles.subtitle}>Fotografe seu prato para analisar os nutrientes</Text>
      <ScannerViewfinder onPickImage={handlePickImage} isAnalyzing={state === 'analyzing'} />
      {state === 'analyzing' && <Text style={styles.analyzingText}>Analisando com IA...</Text>}
      {state === 'result' && result && (
        <View style={styles.resultContainer}>
          <ScanResultCard result={result} onAdd={handleAddToDiary} onReset={handleReset} />
        </View>
      )}
      {state === 'error' && <Text style={styles.errorText}>Não foi possível analisar. Tente novamente.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 56 },
  title: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginBottom: 16 },
  analyzingText: { color: colors.textSecondary, fontFamily: typography.fontFamily.medium, textAlign: 'center', marginTop: 16 },
  resultContainer: { marginTop: 16 },
  errorText: { color: colors.error, textAlign: 'center', marginTop: 16 },
});
```

- [ ] **Step 6.7 — Run test, confirm it passes**

```bash
npx jest src/features/scanner/screens/ScannerScreen.test.tsx --no-coverage
```
Expected: PASS

- [ ] **Step 6.8 — Commit**

```bash
git add src/features/scanner/
git commit -m "feat: implement ScannerScreen with viewfinder, result card and add-to-diary flow"
```

---

## Task 7 — Profile hook + components + ProfileScreen

**Files:**
- Create: `src/features/profile/hooks/useProfile.ts`
- Create: `src/features/profile/components/ProfileHeader.tsx`
- Create: `src/features/profile/components/StreakBadge.tsx`
- Create: `src/features/profile/components/WeeklyCalorieChart.tsx`
- Create: `src/features/profile/components/ProfileMenuItem.tsx`
- Modify: `src/features/profile/screens/ProfileScreen.tsx`
- Test: `src/features/profile/hooks/useProfile.test.ts`
- Test: `src/features/profile/screens/ProfileScreen.test.tsx`

- [ ] **Step 7.1 — Write failing test for useProfile**

```ts
// src/features/profile/hooks/useProfile.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { useProfile } from './useProfile';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: {
    getMeals: jest.fn().mockResolvedValue([
      { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() },
    ]),
  },
}));

jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'João', email: 'j@j.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('useProfile', () => {
  it('retorna o usuário do auth store', () => {
    const { result } = renderHook(() => useProfile());
    expect(result.current.user?.name).toBe('João');
  });

  it('carrega weeklyData com 7 entradas', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weeklyData).toHaveLength(7);
  });

  it('calcula streak > 0 quando há refeições', async () => {
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.streak).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7.2 — Run test, confirm it fails**

```bash
npx jest src/features/profile/hooks/useProfile.test.ts --no-coverage
```
Expected: `Cannot find module './useProfile'`

- [ ] **Step 7.3 — Create useProfile hook**

```ts
// src/features/profile/hooks/useProfile.ts
import { useCallback, useEffect, useState } from 'react';
import { foodLogService } from '@shared/services/food-log.service';
import { authService } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { dateToString } from '@shared/utils/date';

export interface DayCalories { date: string; label: string; calories: number }

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function useProfile() {
  const { user, clearToken } = useAuthStore();
  const [weeklyData, setWeeklyData] = useState<DayCalories[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWeeklyData(); }, []);

  async function loadWeeklyData() {
    setLoading(true);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    try {
      const results = await Promise.all(
        days.map((d) => foodLogService.getMeals(dateToString(d)).catch(() => [])),
      );
      const data: DayCalories[] = days.map((d, i) => ({
        date: dateToString(d),
        label: DAYS_PT[d.getDay()],
        calories: results[i].reduce((s, m) => s + m.calories, 0),
      }));
      setWeeklyData(data);
      let s = 0;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].calories > 0) s++; else break;
      }
      setStreak(s);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = useCallback(async () => {
    try { await authService.logout(); } finally { clearToken(); }
  }, [clearToken]);

  return { user, weeklyData, streak, loading, handleLogout };
}
```

- [ ] **Step 7.4 — Run test, confirm it passes**

```bash
npx jest src/features/profile/hooks/useProfile.test.ts --no-coverage
```
Expected: all 3 tests PASS

- [ ] **Step 7.5 — Create Profile components**

```tsx
// src/features/profile/components/ProfileHeader.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { name: string; email: string }

export function ProfileHeader({ name, email }: Props): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}><Text style={styles.emoji}>😊</Text></View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.email}>{email}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emoji: { fontSize: 32 },
  name: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  email: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 4 },
});
```

```tsx
// src/features/profile/components/StreakBadge.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { typography } from '@theme';

interface Props { days: number }

export function StreakBadge({ days }: Props): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>🔥 {days} {days === 1 ? 'dia' : 'dias'} seguidos</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'center', backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FF8C42', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14, marginTop: 8 },
  text: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: '#FF8C42' },
});
```

```tsx
// src/features/profile/components/WeeklyCalorieChart.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { DayCalories } from '../hooks/useProfile';

interface Props { data: DayCalories[] }

const CHART_H = 60;

export function WeeklyCalorieChart({ data }: Props): React.JSX.Element {
  const max = Math.max(...data.map((d) => d.calories), 1);
  const avg = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.calories, 0) / data.length) : 0;
  const todayDate = data[data.length - 1]?.date;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ESTA SEMANA</Text>
      <View style={styles.bars}>
        {data.map((d) => {
          const heightPct = (d.calories / max) * 100;
          const isToday = d.date === todayDate;
          return (
            <View key={d.date} style={styles.barWrapper}>
              <View style={styles.track}>
                <View style={[styles.bar, { height: `${Math.max(heightPct, 4)}%` as any }, isToday && styles.barToday]} />
              </View>
              <Text style={[styles.dayLabel, isToday && styles.dayToday]}>{d.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.avg}>média {avg} kcal/dia</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14 },
  title: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 12 },
  bars: { flexDirection: 'row', height: CHART_H, alignItems: 'flex-end', gap: 4 },
  barWrapper: { flex: 1, alignItems: 'center', height: CHART_H + 20 },
  track: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primary, borderRadius: 3, opacity: 0.75 },
  barToday: { opacity: 1 },
  dayLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 4 },
  dayToday: { color: colors.primary, fontFamily: typography.fontFamily.bold },
  avg: { fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
});
```

```tsx
// src/features/profile/components/ProfileMenuItem.tsx
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { label: string; onPress: () => void; destructive?: boolean; testID?: string }

export function ProfileMenuItem({ label, onPress, destructive = false, testID }: Props): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7} testID={testID}>
      <Text style={[styles.label, destructive && styles.destructive]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontSize: typography.fontSize.base, color: colors.textPrimary, fontFamily: typography.fontFamily.regular },
  destructive: { color: colors.error },
  chevron: { fontSize: 18, color: colors.textSecondary },
});
```

- [ ] **Step 7.6 — Write failing test for ProfileScreen**

```tsx
// src/features/profile/screens/ProfileScreen.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Maria', email: 'm@m.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('ProfileScreen', () => {
  it('renderiza o nome do usuário', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('Maria')).toBeTruthy();
  });

  it('renderiza o botão de sair', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    expect(await findByTestId('logout-btn')).toBeTruthy();
  });
});
```

- [ ] **Step 7.7 — Run test, confirm it fails**

```bash
npx jest src/features/profile/screens/ProfileScreen.test.tsx --no-coverage
```
Expected: fails (placeholder has no nome do usuário)

- [ ] **Step 7.8 — Implement ProfileScreen**

```tsx
// src/features/profile/screens/ProfileScreen.tsx
import React from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { colors } from '@theme';
import { useProfile } from '../hooks/useProfile';
import { ProfileHeader } from '../components/ProfileHeader';
import { StreakBadge } from '../components/StreakBadge';
import { WeeklyCalorieChart } from '../components/WeeklyCalorieChart';
import { ProfileMenuItem } from '../components/ProfileMenuItem';

export function ProfileScreen(): React.JSX.Element {
  const { user, weeklyData, streak, loading, handleLogout } = useProfile();

  function confirmLogout() {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: handleLogout },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ProfileHeader name={user?.name ?? ''} email={user?.email ?? ''} />
      {streak > 0 && <StreakBadge days={streak} />}
      <View style={styles.section}>
        {!loading && weeklyData.length > 0 && <WeeklyCalorieChart data={weeklyData} />}
      </View>
      <View style={styles.menuCard}>
        <ProfileMenuItem label="🎯 Metas e objetivos" onPress={() => {}} />
        <ProfileMenuItem label="🤖 Personalidade do Coach" onPress={() => {}} />
        <ProfileMenuItem label="🚪 Sair" onPress={confirmLogout} destructive testID="logout-btn" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: 16 },
  section: { marginTop: 20, marginBottom: 8 },
  menuCard: { marginTop: 16, backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
```

- [ ] **Step 7.9 — Run test, confirm it passes**

```bash
npx jest src/features/profile/screens/ProfileScreen.test.tsx --no-coverage
```
Expected: both tests PASS

- [ ] **Step 7.10 — Commit**

```bash
git add src/features/profile/
git commit -m "feat: implement ProfileScreen with streak, weekly chart and logout"
```

---

## Task 8 — Full test suite + start localhost

**Files:** none new

- [ ] **Step 8.1 — Run full test suite to verify no regressions**

```bash
npx jest --no-coverage
```
Expected: all tests pass (no regressions in auth, coach, or shared components)

- [ ] **Step 8.2 — Install dependencies and start webpack dev server**

```bash
npm run web
```
Expected output contains:
```
<i> [webpack-dev-server] Project is running at:
<i> [webpack-dev-server] Loopback: http://localhost:3000/
```

- [ ] **Step 8.3 — Verify in browser**

Open http://localhost:3000 in a browser.

Check each tab:
- **Dashboard**: Greeting with user name, CalorieRing, 3 macro cards, list of today's meals (from MSW mock)
- **Diário**: Date chips (Hoje selected), macro summary row, meal sections with delete buttons, + Adicionar button
- **Scanner**: Dark viewfinder with corner brackets, title "Scanner de alimentos", tapping opens file picker
- **Coach**: Existing chat interface (unchanged)
- **Perfil**: Avatar, name, streak badge (if meals exist), weekly bar chart, menu items including Sair

- [ ] **Step 8.4 — Final commit (spec + plan)**

```bash
git add docs/
git commit -m "docs: add design spec and implementation plan for missing screens"
```
