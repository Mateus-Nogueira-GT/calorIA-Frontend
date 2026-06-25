# Contagem Calórica Diária — Design Spec (Spec B)

**Data:** 2026-06-25
**Escopo:** item D32–D33 do checklist de Frontend:

- Aba de contagem calórica do dia (barra de progresso + refeições)

## 1. Contexto

A "contagem calórica do dia" já existe em parte: o **Diário** (`app/src/features/food-log/screens/FoodLogScreen.tsx`) mostra os totais do dia (`DayMacroSummary`) e as refeições agrupadas por tipo; o **Dashboard** tem o anel de calorias. Falta o elemento pedido em D32–D33: uma **barra de progresso de calorias (consumido vs meta)** no topo da tela de contagem.

**Decisão (alinhada com o usuário):** **aprimorar o Diário existente** em vez de criar uma aba nova (evita redundância com Dashboard/Diário). Sem mudança de backend.

Alinhado à identidade **VITAL LIGHT** (tokens de `app/src/theme/colors.ts`).

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Onde | Aprimorar `FoodLogScreen` (aba Diário) | Já é a tela de contagem do dia; evita aba redundante. |
| Novo elemento | `CalorieProgressBar` (consumido/meta) no topo | É o que falta de D32–D33. |
| Meta de calorias | Plano de dieta ativo (`plan.totalCalories`) ou default 2000 | Mesma regra já usada no Dashboard. |
| Refatoração pontual | Extrair helper `getDailyCalorieGoal(plan)` compartilhado | Hoje a regra de meta está duplicada no `DashboardScreen`. |
| Backend | Nenhuma mudança | Usa `food-log` + `diet` já existentes. |

## 3. Arquitetura

```
app/src/features/food-log/
├── components/
│   ├── CalorieProgressBar.tsx       (novo) barra meta vs consumido + restante
│   └── DayMacroSummary.tsx          (existente — permanece abaixo da barra)
├── screens/
│   └── FoodLogScreen.tsx            (extensão) renderiza CalorieProgressBar no topo

app/src/shared/utils/
└── calories.ts                      (novo) getDailyCalorieGoal(plan) + sumCalories(meals)
```

`DashboardScreen.tsx` passa a importar `getDailyCalorieGoal` do helper (remove a duplicação da constante/regra de meta).

## 4. Modelo de Dados

Sem novos tipos. Usa:
- `Meal` (`food-log.service.ts`): `{ id, name, calories, protein, carbs, fat, loggedAt }`.
- `DietPlan` (`diet.service.ts`): `totalCalories` para a meta quando há plano ativo.

## 5. Helper compartilhado (`shared/utils/calories.ts`)

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

## 6. Componente `CalorieProgressBar`

Props: `{ consumed: number; goal: number }`.

- Mostra: "X / Y kcal" + barra de progresso linear (`consumed/goal`, clamp 0..1) + restante ("faltam N kcal" ou "meta atingida 🎉" quando `consumed >= goal`).
- Cor da barra: `brandPrimary`; trilha `brandTrack`; quando excede a meta, segmento de excesso em `brandSupport` (alerta suave).
- Reutilizável (display puro, sem estado).

## 7. Integração no `FoodLogScreen`

- Lê as refeições do dia selecionado (já vem do `useFoodLog`/store) e o plano de dieta ativo (`useDietStore`/`useDiet`).
- `consumed = sumCalories(mealsDoDia)`; `goal = getDailyCalorieGoal(plan)`.
- Renderiza, na ordem: `DateChip`s (existente) → **`CalorieProgressBar`** (novo) → `DayMacroSummary` (existente) → seções de refeições (existente).

## 8. Estados

| Cenário | UX |
|---|---|
| Sem refeições no dia | Barra em 0%; "faltam Y kcal"; estado vazio das refeições (existente) |
| Consumo < meta | Barra proporcional + restante |
| Consumo ≥ meta | Barra cheia + "meta atingida"; excesso destacado em `brandSupport` |
| Carregando refeições do dia | Barra usa 0 até carregar (ou skeleton fino) |

## 9. Testes (Jest + RTL)

- `calories.test.ts`: `getDailyCalorieGoal` (com plano / sem plano / plano zerado → default); `sumCalories`.
- `CalorieProgressBar.test.tsx`: renderiza "X / Y kcal"; estado meta-atingida quando consumed ≥ goal.
- `FoodLogScreen` (extensão do teste existente): a barra aparece com o consumido do dia.

## 10. Fora de escopo

- Nova aba dedicada (decidido: aprimorar o Diário).
- Metas de macro com barra própria (já há `DayMacroSummary`/`MacroCard`).
- Edição da meta de calorias pelo usuário (vem do plano/onboarding).

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Regra de meta divergir entre Dashboard e Diário | Helper único `getDailyCalorieGoal` consumido por ambos. |
| Plano ativo não carregado ainda no Diário | Default 2000 enquanto `plan === undefined`; atualiza ao carregar. |
