# Contagem Calórica Diária — Implementation Plan (Plano B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma barra de progresso de calorias (consumido vs meta) ao topo do Diário (FoodLog), com a meta vinda do plano de dieta ativo ou do default, e extrair a regra de meta para um helper compartilhado (usado também pelo Dashboard).

**Architecture:** Novo helper `shared/utils/calories.ts` (`getDailyCalorieGoal`, `sumCalories`), novo componente puro `CalorieProgressBar`, integrado no topo do `FoodLogScreen`. Dashboard passa a usar o helper (remove duplicação). Sem mudança de backend. Tudo em `app/`.

**Tech Stack:** React Native 0.76, TypeScript, Zustand (já existente), Jest + @testing-library/react-native.

## Global Constraints

- **Diretório:** `app/`. Branch a partir de `main`.
- **Cores:** só tokens de `app/src/theme/colors.ts`. Barra: `brandPrimary`; trilha `brandTrack`; excesso `brandSupport`.
- **Meta de calorias:** plano de dieta ativo (`plan.totalCalories`) quando > 0; senão `DEFAULT_CALORIE_GOAL = 2000` (mesma regra hoje no `DashboardScreen`).
- **Gate:** `npx jest <path>` dentro de `app/`. Sem `tsc` completo. Saída pristine.
- **Idioma:** copy em PT-BR. **Imports type-only** com `import type`.
- **Commits:** `--no-verify` se o husky travar.

---

### Task 1: Helper de calorias

**Files:**
- Create: `app/src/shared/utils/calories.ts`
- Test: `app/src/shared/utils/calories.test.ts`

**Interfaces:**
- Produces: `DEFAULT_CALORIE_GOAL`, `getDailyCalorieGoal(plan: DietPlan | null | undefined): number`, `sumCalories(meals: Meal[]): number`.

- [ ] **Step 1: Escrever o teste**

Create `app/src/shared/utils/calories.test.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { getDailyCalorieGoal, sumCalories, DEFAULT_CALORIE_GOAL } from './calories';
import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

const plan = (totalCalories: number): DietPlan => ({
  id: 'p', date: '2026-06-25', meals: [], totalCalories, totalProtein: 0, totalCarbs: 0, totalFat: 0, generatedAt: '2026-06-25T00:00:00Z',
});
const meal = (calories: number): Meal => ({ id: 'm', name: 'x', calories, protein: 0, carbs: 0, fat: 0, loggedAt: '2026-06-25T08:00:00Z' });

describe('getDailyCalorieGoal', () => {
  it('usa o total do plano quando > 0', () => {
    expect(getDailyCalorieGoal(plan(1850))).toBe(1850);
  });
  it('usa o default quando não há plano', () => {
    expect(getDailyCalorieGoal(null)).toBe(DEFAULT_CALORIE_GOAL);
    expect(getDailyCalorieGoal(undefined)).toBe(DEFAULT_CALORIE_GOAL);
  });
  it('usa o default quando o plano tem 0 calorias', () => {
    expect(getDailyCalorieGoal(plan(0))).toBe(DEFAULT_CALORIE_GOAL);
  });
});

describe('sumCalories', () => {
  it('soma as calorias das refeições', () => {
    expect(sumCalories([meal(200), meal(300)])).toBe(500);
  });
  it('retorna 0 para lista vazia', () => {
    expect(sumCalories([])).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar (RED)** — `npx jest src/shared/utils/calories.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

Create `app/src/shared/utils/calories.ts`:

```ts
import type { DietPlan } from '@shared/services/diet.service';
import type { Meal } from '@shared/services/food-log.service';

export const DEFAULT_CALORIE_GOAL = 2000;

export function getDailyCalorieGoal(plan: DietPlan | null | undefined): number {
  return plan && plan.totalCalories > 0 ? plan.totalCalories : DEFAULT_CALORIE_GOAL;
}

export function sumCalories(meals: Meal[]): number {
  return meals.reduce((acc, m) => acc + m.calories, 0);
}
```

> Verifique os campos reais de `DietPlan` (`totalCalories`) e `Meal` (`calories`) em `app/src/shared/services/`. Ajuste se os nomes diferirem.

- [ ] **Step 4: Rodar (GREEN) e commitar**

Run: `npx jest src/shared/utils/calories.test.ts` → PASS.
```bash
git add app/src/shared/utils/calories.ts app/src/shared/utils/calories.test.ts
git commit -m "feat(food-log): helper getDailyCalorieGoal/sumCalories"
```

---

### Task 2: Componente `CalorieProgressBar`

**Files:**
- Create: `app/src/features/food-log/components/CalorieProgressBar.tsx`
- Test: `app/src/features/food-log/components/CalorieProgressBar.test.tsx`

**Interfaces:**
- Produces: `CalorieProgressBar({ consumed: number; goal: number })`.

- [ ] **Step 1: Escrever o teste**

Create `app/src/features/food-log/components/CalorieProgressBar.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { CalorieProgressBar } from './CalorieProgressBar';

describe('CalorieProgressBar', () => {
  it('mostra consumido / meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={500} goal={2000} />);
    expect(getByText('500 / 2000 kcal')).toBeTruthy();
  });

  it('mostra restante quando abaixo da meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={500} goal={2000} />);
    expect(getByText(/faltam 1500/)).toBeTruthy();
  });

  it('mostra meta atingida quando consumido >= meta', () => {
    const { getByText } = render(<CalorieProgressBar consumed={2100} goal={2000} />);
    expect(getByText(/meta atingida/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar (RED)** — FAIL.

- [ ] **Step 3: Implementar**

Create `app/src/features/food-log/components/CalorieProgressBar.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';

interface Props {
  consumed: number;
  goal: number;
}

export function CalorieProgressBar({ consumed, goal }: Props): React.JSX.Element {
  const ratio = goal > 0 ? consumed / goal : 0;
  const pct = Math.min(Math.max(ratio, 0), 1);
  const reached = consumed >= goal && goal > 0;
  const remaining = Math.max(goal - consumed, 0);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.value}>{consumed} / {goal} kcal</Text>
        <Text style={[styles.status, reached && styles.statusReached]}>
          {reached ? '🎉 meta atingida' : `faltam ${remaining} kcal`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: reached ? colors.brandSupport : colors.brandPrimary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: 16, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  status: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  statusReached: { color: colors.brandAnchor },
  track: { height: 10, borderRadius: 999, backgroundColor: colors.brandTrack, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 999 },
});
```

- [ ] **Step 4: Rodar (GREEN) e commitar**

Run: `npx jest src/features/food-log/components/CalorieProgressBar.test.tsx` → PASS.
```bash
git add app/src/features/food-log/components/CalorieProgressBar.tsx app/src/features/food-log/components/CalorieProgressBar.test.tsx
git commit -m "feat(food-log): CalorieProgressBar"
```

---

### Task 3: Integrar no Diário + refatorar Dashboard

**Files:**
- Modify: `app/src/features/food-log/screens/FoodLogScreen.tsx`
- Modify: `app/src/features/dashboard/screens/DashboardScreen.tsx`

**Interfaces:**
- Consumes: `CalorieProgressBar` (Task 2), `getDailyCalorieGoal`/`sumCalories` (Task 1), o store de food-log e o de dieta já existentes.

- [ ] **Step 1: Ler os arquivos atuais**

Leia `app/src/features/food-log/screens/FoodLogScreen.tsx` e `app/src/features/dashboard/screens/DashboardScreen.tsx` para entender como hoje obtêm refeições do dia e o plano de dieta, e onde a constante de meta (2000) está duplicada no Dashboard.

- [ ] **Step 2: Integrar a barra no Diário**

No `FoodLogScreen`, obter as refeições do dia selecionado (já disponíveis via `useFoodLog`/store) e o plano (`useDietStore`/`useDiet`). Calcular `consumed = sumCalories(mealsDoDia)` e `goal = getDailyCalorieGoal(plan)`. Renderizar `<CalorieProgressBar consumed={consumed} goal={goal} />` **logo abaixo dos DateChips e acima do `DayMacroSummary`**.

- [ ] **Step 3: Refatorar o Dashboard para usar o helper**

No `DashboardScreen`, substituir a constante/regra local de meta de calorias por `getDailyCalorieGoal(plan)` importado de `@shared/utils/calories`, e (se aplicável) usar `sumCalories` onde soma calorias do food-log. Não alterar o comportamento — apenas remover a duplicação.

- [ ] **Step 4: Rodar testes afetados**

Run: `npx jest src/features/food-log src/features/dashboard` → PASS (ajustar os testes existentes dessas telas se a árvore renderizada mudou; manter pristine).

- [ ] **Step 5: Commitar**

```bash
git add app/src/features/food-log/screens/FoodLogScreen.tsx app/src/features/dashboard/screens/DashboardScreen.tsx
git commit -m "feat(food-log): barra de progresso no Diário + Dashboard usa helper de meta"
```

---

### Task 4: Fechamento

- [ ] **Step 1:** `npx jest src/features/food-log src/features/dashboard src/shared/utils/calories.test.ts` → verde, pristine.
- [ ] **Step 2:** Smoke (web): `npm run web` — Diário mostra a barra (consumido vs meta) no topo; adicionar refeição atualiza a barra; com plano de dieta ativo a meta reflete `plan.totalCalories`.
- [ ] **Step 3:** Commit final (se houver ajustes).

## Self-Review (cobertura vs spec)

- Barra de progresso de calorias do dia (D32–D33): Task 2 + Task 3. ✅
- Refeições do dia já listadas (existente, mantidas): Task 3 (acima do `DayMacroSummary`/seções). ✅
- Meta unificada Dashboard/Diário: Task 1 (helper) + Task 3 (refactor). ✅
- Out of scope: nova aba dedicada; edição da meta pelo usuário.
