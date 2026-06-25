# Evolução & Peso — Implementation Plan (Plano C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Evolução" com gráficos de peso, calorias e streak, e tracking de peso (registrar peso do dia + histórico visual), com backend mockado por MSW.

**Architecture:** Nova feature `features/evolution` (service de peso → store Zustand → hook agregador → componentes → tela), nova aba no `BrandTabNavigator`. Gráficos em RN puro (Views), sem lib de chart. Calorias/streak reusam food-log/lógica do profile. Tudo em `app/`.

**Tech Stack:** React Native 0.76, TypeScript, Zustand, axios, React Navigation (bottom-tabs), MSW, Jest + @testing-library/react-native.

## Global Constraints

- **Diretório:** `app/`. Branch a partir de `main`.
- **Cores:** só tokens de `app/src/theme/colors.ts`. Linha/pontos do peso `brandPrimary`; barras de calorias seguem o padrão de `WeeklyCalorieChart`; streak `brandSupport`.
- **Stores/services/testes:** padrões existentes (espelhar `app/src/features/food-log/store.ts`/teste). Store tests: `@jest/globals` + `jest.mock` + `renderHook`/`act` + reset em `beforeEach`. Updates otimistas com snapshot+rollback+`Alert`.
- **Peso:** upsert por data (registrar peso do mesmo dia substitui).
- **Telas:** tipar com helpers de `app/src/navigation/types.ts`.
- **Gate:** `npx jest <path>` dentro de `app/`. Sem `tsc` completo. Saída pristine (drenar animações com fake timers, se houver).
- **Idioma:** PT-BR. **Imports type-only** com `import type`.
- **Commits:** `--no-verify` se o husky travar.

---

### Task 1: Service de peso

**Files:**
- Create: `app/src/shared/services/weight.service.ts`

**Interfaces:**
- Produces: `WeightEntry`, `weightService.getHistory(): Promise<WeightEntry[]>`, `weightService.addEntry(weightKg: number, date: string): Promise<WeightEntry>`.

- [ ] **Step 1: Criar o service**

Create `app/src/shared/services/weight.service.ts`:

```ts
import api from './api';

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export const weightService = {
  getHistory: () => api.get<WeightEntry[]>('/weight').then((r) => r.data),
  addEntry: (weightKg: number, date: string) =>
    api.post<WeightEntry>('/weight', { weightKg, date }).then((r) => r.data),
};
```

- [ ] **Step 2: Commit** (controlador pode acumular)
```bash
git add app/src/shared/services/weight.service.ts
git commit -m "feat(evolution): weight.service (getHistory/addEntry)"
```

---

### Task 2: Weight store

**Files:**
- Create: `app/src/features/evolution/store.ts`
- Test: `app/src/features/evolution/store.test.ts`

**Interfaces:**
- Produces: `useWeightStore` com `{ entries, isLoading, isSaving }` e ações `load`, `addEntry`, `clear`.

- [ ] **Step 1: Escrever o teste**

Create `app/src/features/evolution/store.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar (RED)** — `npx jest src/features/evolution/store.test.ts` → FAIL.

- [ ] **Step 3: Implementar o store**

Create `app/src/features/evolution/store.ts`:

```ts
import { Alert } from 'react-native';
import { create } from 'zustand';
import { weightService } from '@shared/services/weight.service';
import type { WeightEntry } from '@shared/services/weight.service';

interface WeightState {
  entries: WeightEntry[];
  isLoading: boolean;
  isSaving: boolean;
  load: () => Promise<void>;
  addEntry: (weightKg: number, date: string) => Promise<void>;
  clear: () => void;
}

const initialState = { entries: [] as WeightEntry[], isLoading: false, isSaving: false };

function upsert(entries: WeightEntry[], next: WeightEntry): WeightEntry[] {
  const without = entries.filter((e) => e.date !== next.date);
  return [...without, next].sort((a, b) => a.date.localeCompare(b.date));
}

export const useWeightStore = create<WeightState>((set, get) => ({
  ...initialState,

  load: async () => {
    set({ isLoading: true });
    try {
      const entries = await weightService.getHistory();
      set({ entries: [...entries].sort((a, b) => a.date.localeCompare(b.date)), isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addEntry: async (weightKg, date) => {
    const snapshot = get().entries;
    const optimistic: WeightEntry = { id: `temp-${date}`, date, weightKg };
    set({ entries: upsert(snapshot, optimistic), isSaving: true });
    try {
      const saved = await weightService.addEntry(weightKg, date);
      set((s) => ({ entries: upsert(s.entries.filter((e) => e.id !== optimistic.id), saved), isSaving: false }));
    } catch (e) {
      set({ entries: snapshot, isSaving: false });
      Alert.alert('Não foi possível salvar o peso', 'Tente novamente.');
      throw e;
    }
  },

  clear: () => set({ ...initialState }),
}));
```

- [ ] **Step 4: Rodar (GREEN) e commitar**

Run: `npx jest src/features/evolution/store.test.ts` → PASS (5 testes).
```bash
git add app/src/features/evolution/store.ts app/src/features/evolution/store.test.ts
git commit -m "feat(evolution): weight store com upsert otimista"
```

---

### Task 3: Componentes — `WeightInput`, `WeightLineChart`

**Files:**
- Create: `app/src/features/evolution/components/WeightInput.tsx`
- Create: `app/src/features/evolution/components/WeightLineChart.tsx`
- Test: `app/src/features/evolution/components/WeightInput.test.tsx`

**Interfaces:**
- Produces: `WeightInput({ onSave: (kg: number) => void; saving: boolean })`, `WeightLineChart({ entries: WeightEntry[] })`.

- [ ] **Step 1: Escrever o teste do `WeightInput`**

Create `app/src/features/evolution/components/WeightInput.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightInput } from './WeightInput';

describe('WeightInput', () => {
  it('salva um número válido', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.changeText(getByTestId('weight-input'), '80.5');
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).toHaveBeenCalledWith(80.5);
  });

  it('não salva valor inválido', () => {
    const onSave = jest.fn();
    const { getByText } = render(<WeightInput onSave={onSave} saving={false} />);
    fireEvent.press(getByText('Registrar peso de hoje'));
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar (RED)** — FAIL.

- [ ] **Step 3: Implementar `WeightInput`**

Create `app/src/features/evolution/components/WeightInput.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';

interface Props {
  onSave: (kg: number) => void;
  saving: boolean;
}

export function WeightInput({ onSave, saving }: Props): React.JSX.Element {
  const [value, setValue] = useState('');

  const submit = () => {
    const kg = Number(value.replace(',', '.'));
    if (!kg || kg <= 0) return;
    onSave(kg);
    setValue('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Peso de hoje (kg)</Text>
      <View style={styles.row}>
        <TextInput
          testID='weight-input'
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType='numeric'
          placeholder='Ex: 80.5'
          placeholderTextColor={colors.brandTextMuted}
        />
      </View>
      <Button onPress={submit} loading={saving}>Registrar peso de hoje</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 12 },
  label: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  row: { flexDirection: 'row' },
  input: { flex: 1, backgroundColor: colors.brandMutedSurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: colors.brandText },
});
```

- [ ] **Step 4: Rodar (GREEN)** — PASS.

- [ ] **Step 5: Implementar `WeightLineChart`** (barras verticais em RN puro, como `WeeklyCalorieChart`)

Create `app/src/features/evolution/components/WeightLineChart.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import type { WeightEntry } from '@shared/services/weight.service';

export function WeightLineChart({ entries }: { entries: WeightEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return <Text style={styles.empty}>Sem registros de peso ainda.</Text>;
  }
  const weights = entries.map((e) => e.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {entries.map((e) => {
          const h = 24 + ((e.weightKg - min) / range) * 80; // 24..104px
          return (
            <View key={e.id} style={styles.barCol}>
              <Text style={styles.value}>{e.weightKg}</Text>
              <View style={[styles.bar, { height: h }]} />
              <Text style={styles.day}>{e.date.slice(5)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: 16, padding: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  barCol: { alignItems: 'center', flex: 1, gap: 4 },
  value: { fontSize: 10, color: colors.brandTextMuted },
  bar: { width: 14, borderRadius: 999, backgroundColor: colors.brandPrimary },
  day: { fontSize: 10, color: colors.brandTextMuted },
  empty: { textAlign: 'center', color: colors.brandTextMuted, fontSize: 14, paddingVertical: 24 },
});
```

- [ ] **Step 6: Rodar e commitar**

Run: `npx jest src/features/evolution/components` → PASS.
```bash
git add app/src/features/evolution/components/WeightInput.tsx app/src/features/evolution/components/WeightInput.test.tsx app/src/features/evolution/components/WeightLineChart.tsx
git commit -m "feat(evolution): WeightInput e WeightLineChart"
```

---

### Task 4: Hook `useEvolution` + `EvolutionScreen`

**Files:**
- Create: `app/src/features/evolution/hooks/useEvolution.ts`
- Create: `app/src/features/evolution/screens/EvolutionScreen.tsx`
- Test: `app/src/features/evolution/screens/EvolutionScreen.test.tsx`

**Interfaces:**
- Consumes: `useWeightStore`, `WeightInput`, `WeightLineChart`, e (reaproveitando) `WeeklyCalorieChart`/`StreakBadge` + a lógica de dados semanais de `useProfile`.
- Produces: `useEvolution()`, `EvolutionScreen`.

- [ ] **Step 1: Implementar o hook**

Create `app/src/features/evolution/hooks/useEvolution.ts`:

```ts
import { useEffect } from 'react';
import { useWeightStore } from '../store';

export function useEvolution() {
  const entries = useWeightStore((s) => s.entries);
  const isLoading = useWeightStore((s) => s.isLoading);
  const isSaving = useWeightStore((s) => s.isSaving);
  const load = useWeightStore((s) => s.load);
  const addEntry = useWeightStore((s) => s.addEntry);

  useEffect(() => {
    load();
  }, [load]);

  const currentWeight = entries.length ? entries[entries.length - 1].weightKg : null;
  const firstWeight = entries.length ? entries[0].weightKg : null;
  const delta = currentWeight !== null && firstWeight !== null ? Number((currentWeight - firstWeight).toFixed(1)) : 0;

  return { entries, isLoading, isSaving, addEntry, currentWeight, delta };
}
```

> Calorias semanais + streak: reaproveitar `useProfile` (que já calcula `weeklyData` e `streak`) chamando-o na `EvolutionScreen`, OU extrair sua lógica para um util compartilhado se preferir não acoplar à feature profile. Para este plano, a `EvolutionScreen` chama `useProfile()` e usa `weeklyData`/`streak`.

- [ ] **Step 2: Escrever o teste do `EvolutionScreen`**

Create `app/src/features/evolution/screens/EvolutionScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { EvolutionScreen } from './EvolutionScreen';
import { useWeightStore } from '../store';

jest.mock('@shared/services/weight.service', () => ({
  weightService: { getHistory: jest.fn().mockResolvedValue([{ id: '1', date: '2026-06-20', weightKg: 80 }]), addEntry: jest.fn() },
}));
jest.mock('@features/profile/hooks/useProfile', () => ({
  useProfile: () => ({ weeklyData: [], streak: 3, user: { name: 'Ana' }, loading: false, handleLogout: jest.fn() }),
}));

describe('EvolutionScreen', () => {
  beforeEach(() => {
    useWeightStore.setState({ entries: [], isLoading: false, isSaving: false });
    jest.clearAllMocks();
  });

  it('carrega o histórico de peso e mostra o input', async () => {
    const { getByText } = render(<EvolutionScreen />);
    await waitFor(() => expect(getByText('Registrar peso de hoje')).toBeTruthy());
  });
});
```

- [ ] **Step 3: Rodar (RED)** — FAIL.

- [ ] **Step 4: Implementar `EvolutionScreen`**

Create `app/src/features/evolution/screens/EvolutionScreen.tsx`:

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { todayString } from '@shared/utils/date';
import { useEvolution } from '../hooks/useEvolution';
import { WeightInput } from '../components/WeightInput';
import { WeightLineChart } from '../components/WeightLineChart';
import { WeeklyCalorieChart } from '@features/profile/components/WeeklyCalorieChart';
import { StreakBadge } from '@features/profile/components/StreakBadge';
import { useProfile } from '@features/profile/hooks/useProfile';

export function EvolutionScreen(): React.JSX.Element {
  const { entries, isSaving, addEntry, currentWeight, delta } = useEvolution();
  const { weeklyData, streak } = useProfile();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Evolução</Text>

        <Text style={styles.section}>Peso</Text>
        {currentWeight !== null ? (
          <Text style={styles.summary}>Atual: {currentWeight} kg · {delta >= 0 ? '+' : ''}{delta} kg no período</Text>
        ) : null}
        <WeightLineChart entries={entries} />
        <View style={styles.spacer} />
        <WeightInput onSave={(kg) => addEntry(kg, todayString()).catch(() => {})} saving={isSaving} />

        <Text style={styles.section}>Calorias</Text>
        <WeeklyCalorieChart data={weeklyData} />

        <Text style={styles.section}>Sequência</Text>
        {streak > 0 ? <StreakBadge days={streak} /> : <Text style={styles.summary}>Sem sequência ativa.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 24, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, marginBottom: 4 },
  section: { fontSize: 16, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold, marginTop: 16 },
  summary: { fontSize: 13, color: colors.brandTextMuted },
  spacer: { height: 12 },
});
```

> Verifique as props reais de `WeeklyCalorieChart` (`data`) e `StreakBadge` (`days`) e a forma de `weeklyData`/`streak` em `useProfile`. Ajuste se diferirem.

- [ ] **Step 5: Rodar (GREEN) e commitar**

Run: `npx jest src/features/evolution` → PASS, pristine.
```bash
git add app/src/features/evolution/hooks app/src/features/evolution/screens
git commit -m "feat(evolution): hook useEvolution e EvolutionScreen"
```

---

### Task 5: Navegação — aba "Evolução"

**Files:**
- Modify: `app/src/navigation/types.ts` (add `Evolution` ao `TabParamList`)
- Modify: `app/src/navigation/BrandTabNavigator.tsx` (add aba + ícone)

- [ ] **Step 1: Tipo** — em `types.ts`, adicionar `Evolution: undefined;` ao `TabParamList`.

- [ ] **Step 2: Aba** — em `BrandTabNavigator.tsx`:
  - Importar `EvolutionScreen`.
  - Adicionar branch de ícone para `Evolution` no `TabIcon` (linha ascendente/gráfico no estilo dos ícones desenhados, usando `tint`).
  - Adicionar `<Tab.Screen name='Evolution' component={EvolutionScreen} options={{ title: 'Evolução' }} />` (posição: após Profile ou onde fizer sentido).

- [ ] **Step 3: Rodar e commitar**

Run: `npx jest src/features/evolution` → PASS.
```bash
git add app/src/navigation/types.ts app/src/navigation/BrandTabNavigator.tsx
git commit -m "feat(evolution): aba Evolução na tab bar"
```

> ⚠️ Densidade: a tab bar fica com muitos itens (ver Risco na spec). Validar visualmente; labels/ícones compactos.

---

### Task 6: MSW de peso + limpeza no logout

**Files:**
- Create: `app/mocks/handlers/weight.ts`
- Modify: `app/mocks/server.ts` (registrar `weightHandlers`)
- Modify: `app/src/features/auth/store.ts` (`clearToken` → `useWeightStore.getState().clear()`)

- [ ] **Step 1: Handlers MSW**

Create `app/mocks/handlers/weight.ts`:

```ts
import { http, HttpResponse } from 'msw';

interface WeightEntry { id: string; date: string; weightKg: number; }

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

let entries: WeightEntry[] = [
  { id: 'w1', date: isoDate(-14), weightKg: 82 },
  { id: 'w2', date: isoDate(-7), weightKg: 81.2 },
  { id: 'w3', date: isoDate(-1), weightKg: 80.5 },
];
let seq = 10;

export const weightHandlers = [
  http.get('*/weight', () => HttpResponse.json([...entries].sort((a, b) => a.date.localeCompare(b.date)))),

  http.post('*/weight', async ({ request }) => {
    const body = (await request.json()) as { weightKg: number; date: string };
    const existing = entries.find((e) => e.date === body.date);
    if (existing) {
      existing.weightKg = body.weightKg;
      return HttpResponse.json(existing);
    }
    const created: WeightEntry = { id: `w-${seq++}`, date: body.date, weightKg: body.weightKg };
    entries = [...entries, created];
    return HttpResponse.json(created, { status: 201 });
  }),
];
```

- [ ] **Step 2: Registrar** em `app/mocks/server.ts` (`import { weightHandlers }` + `...weightHandlers,`).

- [ ] **Step 3: Logout** — em `app/src/features/auth/store.ts`: `import { useWeightStore } from '@features/evolution/store';` e `useWeightStore.getState().clear();` em `clearToken`.

- [ ] **Step 4: Rodar e commitar**

Run: `npx jest src/features/evolution src/features/auth` → evolution verde (auth pode ter falhas pré-existentes).
```bash
git add app/mocks/handlers/weight.ts app/mocks/server.ts app/src/features/auth/store.ts
git commit -m "feat(evolution): MSW de peso e limpeza no logout"
```

---

### Task 7: Fechamento

- [ ] **Step 1:** `npx jest src/features/evolution` → verde, pristine.
- [ ] **Step 2:** Smoke (web): `npm run web` — aba "Evolução"; registrar peso atualiza o gráfico; calorias e streak aparecem; logout zera.
- [ ] **Step 3:** Commit final (se houver ajustes).

## Self-Review (cobertura vs spec)

- Tela de evolução com peso/calorias/streak (D33–D35): Tasks 3–5. ✅
- Input de peso com histórico visual (D35): Task 3 (`WeightInput` + `WeightLineChart`), Task 2 (store). ✅
- Backend de peso mockado (MSW): Task 6. ✅
- Nova aba Evolução: Task 5. ✅
- Logout limpa store: Task 6. ✅
- Out of scope: lib de gráficos externa; metas/projeções de peso; editar registros antigos.
