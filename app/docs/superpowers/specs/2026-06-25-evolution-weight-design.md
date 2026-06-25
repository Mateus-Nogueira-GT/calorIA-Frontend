# Evolução & Peso — Design Spec (Spec C)

**Data:** 2026-06-25
**Escopo:** itens D33–D35 do checklist de Frontend:

- Tela de evolução: gráfico de peso, calorias consumidas, streaks — D33–D35
- Input de peso com histórico visual — D35

## 1. Contexto

Hoje o app coleta **peso apenas uma vez** no onboarding (`ProfileSetupScreen` → `weight_kg`), sem histórico, sem gráfico e sem edição posterior. O Perfil já tem `WeeklyCalorieChart` e `StreakBadge`, mas limitados à semana e dentro do `ProfileScreen`.

Esta spec cria uma **nova aba "Evolução"** consolidando progresso (peso, calorias, streak) e um **tracking de peso** novo (registrar peso + histórico visual). Backend de peso não existe → contrato documentado + **MSW** (padrão do projeto).

Alinhado à identidade **VITAL LIGHT** (tokens de `app/src/theme/colors.ts`).

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Onde | **Nova aba "Evolução"** | Decisão do usuário; dá destaque ao progresso. |
| Peso | Nova feature (store + service + gráfico) | Hoje não existe histórico de peso. |
| Input de peso | Registrar peso do dia + ver histórico | Atende D35. |
| Gráficos | RN puro (View/Animated) sem lib de chart | Sem dependência nova; segue o padrão do `WeeklyCalorieChart` (barras em View). |
| Calorias/streak | Reaproveitar `food-log` + lógica de `useProfile` | Evita duplicar regra. |
| Backend (peso) | Contrato + MSW | Backend inexistente. |

## 3. Arquitetura

```
app/src/features/evolution/
├── components/
│   ├── WeightLineChart.tsx       gráfico de linha/barras do peso ao longo do tempo (RN puro)
│   ├── WeightInput.tsx           registrar peso de hoje (Input numérico + salvar)
│   ├── CaloriesTrendChart.tsx    calorias consumidas no período (reusa padrão do WeeklyCalorieChart)
│   └── StreakSummary.tsx         streak atual + recorde (reusa StreakBadge)
├── screens/
│   └── EvolutionScreen.tsx       orquestra: peso + calorias + streak
├── hooks/
│   └── useEvolution.ts           agrega peso (store) + calorias/streak (food-log/profile)
└── store.ts                      Zustand de peso (+ store.test.ts)

app/src/shared/services/
└── weight.service.ts             getHistory / addEntry

app/src/navigation/
├── BrandTabNavigator.tsx         (extensão) 7ª aba "Evolução"
└── types.ts                      (extensão) Evolution no TabParamList

app/src/features/auth/store.ts    (extensão) clearToken → useWeightStore.clear()
app/mocks/handlers/weight.ts      (novo) handlers MSW
app/mocks/server.ts               (extensão) registra weightHandlers
```

> Reaproveitamento: `WeeklyCalorieChart`/`StreakBadge` de `features/profile/components` podem ser importados pela `EvolutionScreen`; se ficarem usados por ambas as features, considerar mover para `shared/components` (decisão de implementação — só se realmente compartilhado).

## 4. Modelo de Dados

```ts
// weight.service.ts
export interface WeightEntry {
  id: string;
  date: string;      // YYYY-MM-DD
  weightKg: number;
}
```

Calorias usam `Meal`/`food-log` (já existente); streak reusa a lógica de `useProfile` (contagem regressiva de dias com `calories > 0`).

## 5. Contrato de API (peso — novo, MSW)

| Método | Path | Body | Retorno |
|---|---|---|---|
| `GET` | `/weight` | — | `WeightEntry[]` (ordenado por data asc) |
| `POST` | `/weight` | `{ weightKg: number; date: string }` | `WeightEntry` (upsert por data) |

`POST` faz **upsert** por `date` (registrar peso do mesmo dia substitui). Calorias/streak não têm endpoint novo (reusam `/food-log`).

## 6. Estado (Zustand) — `features/evolution/store.ts`

```ts
interface WeightState {
  entries: WeightEntry[];
  isLoading: boolean;
  isSaving: boolean;

  load: () => Promise<void>;
  addEntry: (weightKg: number, date: string) => Promise<void>; // otimista (upsert local) + reconcilia
  clear: () => void;   // logout
}
```

`addEntry`: upsert otimista (substitui entrada da mesma data ou insere ordenado), chama `POST /weight`, em sucesso substitui pelo canônico, em erro reverte + `Alert`.

## 7. Hook `useEvolution`

Agrega:
- `weightEntries` (do store de peso) + derivados (peso atual, variação no período).
- `weeklyCalories` (reusa a lógica de `useProfile`/`food-log` para N dias).
- `streak` (atual) — reusa o cálculo de `useProfile`.
Retorna o necessário para a `EvolutionScreen` montar os 3 blocos.

## 8. Componentes (destaques)

- **WeightLineChart** (`{ entries: WeightEntry[] }`): gráfico de pontos/linha em RN puro (Views posicionadas) ou barras verticais (como `WeeklyCalorieChart`), com eixo de datas e min/max; estado vazio "Sem registros de peso ainda".
- **WeightInput** (`{ onSave: (kg: number) => void; saving: boolean }`): `Input` numérico (kg) + botão "Registrar peso de hoje"; validação (número > 0).
- **CaloriesTrendChart**: reusa o padrão do `WeeklyCalorieChart` para calorias do período.
- **StreakSummary**: streak atual (e recorde, se derivável) via `StreakBadge`.
- **EvolutionScreen**: `ScrollView` com seções — Peso (input + gráfico + variação), Calorias (gráfico), Streak (resumo). Carrega no mount.

## 9. Navegação

- `BrandTabNavigator`: adiciona **7ª aba "Evolução"** (ícone de gráfico/linha ascendente no estilo dos ícones desenhados) → `EvolutionScreen`.
- `types.ts`: `Evolution: undefined` no `TabParamList`.
- ⚠️ **Densidade:** com 6 abas atuais + botão central de câmera (Spec A) + Evolução, a tab bar fica cheia (ver Riscos).

## 10. Estados de loading/erro

| Cenário | UX |
|---|---|
| Carregando peso/calorias | Skeleton/spinner por seção |
| Sem registros de peso | Estado vazio no gráfico + CTA no `WeightInput` |
| `addEntry` em andamento | Botão "Registrar" disabled + spinner |
| `addEntry` falha | Reverte upsert otimista + `Alert` |
| `GET /weight` falha | Estado de erro com "Tentar de novo" |

## 11. Testes (Jest + RTL)

- `store.test.ts` (peso): `load` popula; `addEntry` upsert otimista + reconcilia + reverte em erro; `clear`.
- `WeightInput.test.tsx`: valida número > 0; dispara `onSave`.
- `WeightLineChart.test.tsx`: render com entries e estado vazio.
- `EvolutionScreen.test.tsx`: monta as 3 seções; carrega no mount (services mockados).
- `weight` handlers MSW; `clearToken` limpa o store no logout.

## 12. Fora de escopo

- Lib de gráficos externa (victory/chart-kit) — usa RN puro.
- Metas de peso / projeções.
- Edição/exclusão de registros antigos de peso (só registrar/upsert do dia).
- Exportar dados.

## 13. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Tab bar densa (7 abas + câmera central) | Ícones/labels compactos; se necessário, mover Coach/Community para um menu "Mais" (follow-up). |
| Gráfico em RN puro ficar limitado | Começar com barras (como `WeeklyCalorieChart`); evoluir depois se necessário. |
| Duplicar lógica de streak/calorias do `useProfile` | Extrair a lógica para um util compartilhado se a duplicação incomodar. |
| Backend de peso inexistente | MSW com histórico de exemplo; contrato documentado para o backend. |
