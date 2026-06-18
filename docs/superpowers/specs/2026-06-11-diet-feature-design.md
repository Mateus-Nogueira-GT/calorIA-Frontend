# Diet Feature — Design Spec

**Data:** 2026-06-11
**Branch alvo:** `feat/d1-d2-frontend-setup` (ou nova feature branch)
**Escopo:** itens pendentes D13–D16 do checklist do projeto:

- Tela da dieta gerada (cards por refeição: café, almoço, lanche, janta)
- Interação: marcar refeição como concluída
- Redirecionamento pós-chat → tela principal com dieta

## 1. Contexto e Motivação

O app CalorIA já tem chat com o Coach (`features/coach`), Dashboard com anel de calorias e macros (`features/dashboard`), e Diário alimentar manual (`features/food-log`). Falta a peça central da proposta de valor: a **dieta gerada pela IA**, com refeições estruturadas e tracking de cumprimento.

O backend (não escopo desta spec) terá uma LLM que conversa com o usuário pelo Coach e, quando coletar dados suficientes, sinaliza ao front que pode gerar a dieta. O usuário aciona explicitamente a geração, é redirecionado pro Dashboard, e a partir daí pode marcar cada refeição como concluída.

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Origem dos dados | Novos endpoints no backend (LLM-driven) | Mantém lógica de geração no servidor; front só consome. |
| Gatilho do redirect | Botão explícito no chat | Dá controle ao usuário; backend só sinaliza prontidão via flag. |
| Modelo de dados | Estruturado (itens + macros + horário sugerido) | Permite UI rica com chips de macro e lista de itens. |
| Estado "concluído" | Persistido no backend | LLM pode usar histórico de aderência pra ajustar dieta futura. |
| Visual do card | Expandido (itens visíveis + chips coloridos) | Sem tap pra expandir; tudo visível no scroll. |
| Localização na navegação | Composição dentro do `DashboardScreen` (sem nova tab) | Mobile-first: tab bar já tem 5 itens; "uma tela = um propósito"; o anel passa a refletir o progresso real da dieta. |

## 3. Arquitetura

### 3.1. Estrutura de pastas

```
src/features/diet/                    (nova feature isolada)
├── components/
│   ├── DietPlanSection.tsx           orquestrador renderizado pelo Dashboard
│   ├── MealPlanCard.tsx              card expandido por refeição
│   ├── MealItemRow.tsx               linha de item dentro do card
│   ├── MacroChips.tsx                chips kcal/P/C/G coloridos
│   ├── DietProgressHeader.tsx        "X de 4 refeições concluídas"
│   └── EmptyDietState.tsx            placeholder quando plan === null
├── hooks/
│   └── useDiet.ts                    seletores agregados do store
├── store.ts                          Zustand store
└── store.test.ts                     unit tests do store

src/shared/services/
└── diet.service.ts                   getCurrent / generate / completeMeal / uncompleteMeal

src/features/coach/components/
└── GenerateDietButton.tsx            botão renderizado no chat

src/features/coach/store.ts           extensão: preservar canGenerateDiet por mensagem
src/shared/services/coach.service.ts  extensão: campo canGenerateDiet em CoachMessage

src/features/dashboard/screens/DashboardScreen.tsx
                                      compõe DietPlanSection; meta de calorias agora reflete a dieta
```

### 3.2. Sem novas rotas de navegação

Não há `DietScreen` como rota. O conteúdo da dieta é montado pelo `DietPlanSection` dentro do `DashboardScreen`. O redirect pós-chat usa `navigation.navigate('Dashboard')`, que já existe no `TabParamList`.

## 4. Modelo de Dados

### 4.1. Tipos compartilhados (`shared/services/diet.service.ts`)

```ts
export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface MealItem {
  name: string;          // "2 ovos mexidos"
  quantity: number;      // 2
  unit: string;          // "un", "g", "ml", "xíc"
  calories: number;
}

export interface PlannedMeal {
  id: string;
  type: MealType;
  title: string;             // "Café da manhã"
  suggestedTime: string;     // "08:00" (HH:mm)
  items: MealItem[];
  calories: number;          // agregado
  protein: number;           // g
  carbs: number;             // g
  fat: number;               // g
  completedAt: string | null;
}

export interface DietPlan {
  id: string;
  date: string;              // "YYYY-MM-DD"
  meals: PlannedMeal[];      // exatamente 4 (café, almoço, lanche, jantar) na ordem
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  generatedAt: string;       // ISO
}
```

### 4.2. Extensão de `CoachMessage` (`shared/services/coach.service.ts`)

```ts
export interface CoachMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: string;
  canGenerateDiet?: boolean; // novo: backend marca true quando há dados suficientes
}
```

## 5. Contrato de API

| Método | Path | Body | Retorno | Uso |
|---|---|---|---|---|
| `GET` | `/diet/current` | — | `DietPlan \| null` | Carrega no mount do Dashboard |
| `POST` | `/diet/generate` | — | `DietPlan` | Botão "Gerar minha dieta" no chat |
| `PATCH` | `/diet/meals/:mealId/complete` | — | `PlannedMeal` atualizada | Toggle "marcar concluída" |
| `PATCH` | `/diet/meals/:mealId/uncomplete` | — | `PlannedMeal` atualizada | Toggle "desmarcar" |

Todos sob `api` (axios) já configurado em `shared/services/api.ts`. Erros são propagados via throw e tratados nos consumers.

## 6. Estado (Zustand)

### 6.1. `features/diet/store.ts`

```ts
interface DietState {
  plan: DietPlan | null | undefined;   // undefined = não carregado; null = carregado vazio
  isLoading: boolean;                  // GET /diet/current em andamento
  isGenerating: boolean;               // POST /diet/generate em andamento
  togglingMealId: string | null;       // qual refeição está em flight

  loadCurrent: () => Promise<void>;
  generate: () => Promise<DietPlan>;   // retorna o plan pra quem chamou poder navegar/usar
  toggleMealComplete: (mealId: string) => Promise<void>;
  clear: () => void;                   // usado no logout
}
```

### 6.2. Atualização otimista no toggle

`toggleMealComplete(mealId)`:

1. Lê `meal` atual do `plan.meals` pelo id.
2. Salva snapshot do `completedAt` anterior.
3. Aplica mudança otimista: alterna `completedAt` entre `new Date().toISOString()` e `null`.
4. Marca `togglingMealId = mealId` (impede duplo-toque).
5. Chama `PATCH /diet/meals/:id/complete` ou `/uncomplete` conforme o sentido.
6. Em sucesso: substitui a meal pela resposta canônica do backend; limpa `togglingMealId`.
7. Em erro: reverte `completedAt` ao snapshot; limpa `togglingMealId`; dispara `Alert("Não foi possível marcar. Tente novamente.")`.

Razão da escolha: feedback instantâneo ao toque é crítico em mobile; latência de rede tornaria a interação travada.

### 6.3. Hook `useDiet`

```ts
export function useDiet() {
  const plan = useDietStore(s => s.plan);
  const isLoading = useDietStore(s => s.isLoading);
  const toggleMealComplete = useDietStore(s => s.toggleMealComplete);
  const completedCount = plan?.meals.filter(m => m.completedAt).length ?? 0;
  const totalCount = plan?.meals.length ?? 0;
  return { plan, isLoading, toggleMealComplete, completedCount, totalCount };
}
```

### 6.4. Extensão do `coach/store.ts`

A interface local `StoreMessage` no `coach/store.ts` ganha o campo opcional `canGenerateDiet?: boolean` (espelhando o de `CoachMessage`). O mapeamento em `toStoreMessage` propaga o flag. A renderização do botão usa esse flag na **última mensagem do coach** que o tenha ativo; mensagens anteriores não renderizam o botão (evita botões duplicados no histórico).

### 6.5. Logout

`useAuthStore.logout` deve chamar `useDietStore.getState().clear()`. Se o `useFoodLogStore` ainda não tiver um `clear` chamado no logout, **fora do escopo desta spec**; nessa hipótese, registrar como follow-up.

## 7. Componentes

### 7.1. `DietPlanSection.tsx` (orquestrador)

- Consome `useDiet()`.
- `plan === undefined` → renderiza 4 skeletons animados (placeholder cinza pulsante, um por refeição).
- `plan === null` → renderiza `EmptyDietState`.
- `plan` válido → renderiza `DietProgressHeader` + lista de `MealPlanCard` na ordem do array `meals`.

### 7.2. `MealPlanCard.tsx`

Props: `meal: PlannedMeal`, `onToggleComplete: (mealId: string) => void`, `isToggling: boolean`.

Layout:
- Header: emoji (mapa por `type`) + título + horário sugerido.
- `MacroChips` com kcal/P/C/G.
- Lista de `MealItemRow` (nome + kcal alinhado à direita).
- Botão full-width: "Marcar como concluída" / "✓ Concluída" (verde quando `completedAt !== null`).
- Botão é `disabled` quando `isToggling === true`.

Emojis: `breakfast: 🥐`, `lunch: 🍱`, `snack: 🍎`, `dinner: 🍽️`.

### 7.3. `MealItemRow.tsx`

Props: `item: MealItem`.

Display puro: linha com nome à esquerda, `kcal` à direita. Sem interação.

### 7.4. `MacroChips.tsx`

Props: `kcal`, `protein`, `carbs`, `fat`.

4 chips coloridos: kcal=verde (`#E8F8EE`/`#2DB36A`), proteína=laranja (`#FFEFE3`/`#FF8C42`), carbo=azul (`#E0F4F8`/`#17A2B8`), gordura=amarelo (`#FFF6D9`/`#B8860B`). Reutilizável fora do contexto de dieta.

### 7.5. `DietProgressHeader.tsx`

Props: `plan: DietPlan`.

Mostra "Sua dieta de hoje", "X de Y refeições concluídas", e uma barra de progresso fina (`completedCount / totalCount`). Cor da barra usa `colors.primary`.

### 7.6. `EmptyDietState.tsx`

Props: `onOpenChat: () => void`, opcional `errorMode?: boolean`.

- Modo padrão: "Você ainda não tem uma dieta. Fale com o Coach pra gerar a sua." + botão "Falar com o Coach".
- Modo erro: "Não foi possível carregar sua dieta." + botão "Tentar de novo" (recarrega).

### 7.7. `GenerateDietButton.tsx` (em `coach/components/`)

Props: `onSuccess: () => void`.

- Estado idle: "✨ Gerar minha dieta agora".
- Em loading (`isGenerating === true`): disabled, texto "Gerando sua dieta...", spinner inline.
- Sucesso: chama `onSuccess()` (o plan já foi gravado no `useDietStore` por `generate()`).
- Erro: `Alert("Não foi possível gerar. Tente de novo.")`.

Renderizado pelo `CoachScreen` abaixo da **última mensagem do coach** com `canGenerateDiet === true`. O `onSuccess` no `CoachScreen` navega pra `Dashboard` via `useNavigation`.

### 7.8. Mudanças no `DashboardScreen.tsx`

- Importa `DietPlanSection` e `useDiet` (ou `useDietStore`).
- Chama `useDietStore.getState().loadCurrent()` no `useEffect` se `plan === undefined`.
- **Cálculo de macros e meta de calorias**:
  - Se `plan` é um `DietPlan`: `CALORIE_GOAL = plan.totalCalories` (e metas de macro vêm de `plan.totalProtein/Carbs/Fat`); macros somam apenas `PlannedMeal`s com `completedAt !== null`.
  - Se `plan === null` ou `plan === undefined`: mantém constantes atuais (`CALORIE_GOAL = 2000` etc.) e soma do food-log (comportamento atual).
- Renderiza, na ordem: anel → linha de `MacroCard`s → `<DietPlanSection />` → seção secundária "Refeições registradas" (food-log atual).

## 8. Navegação

```
[Coach tab]
   └─ usuário envia mensagem
      └─ resposta do coach inclui canGenerateDiet=true
         └─ GenerateDietButton renderizado abaixo daquela bolha
            └─ tap → store.generate()
               ├─ sucesso → useNavigation().navigate('Dashboard') → DietPlanSection já renderiza o plan
               └─ erro → Alert + botão volta ao idle
```

`useNavigation` tipado como `TabScreenProps<'Coach'>['navigation']` (o tipo helper já existe em `navigation/types.ts`). Nenhuma adição ao `TabParamList` é necessária.

## 9. Estados de loading e erro

| Cenário | UX |
|---|---|
| Dashboard mountando, `GET /diet/current` em andamento | `DietPlanSection` renderiza 4 skeletons pulsantes (não spinner central) |
| `GET /diet/current` retorna `null` | `EmptyDietState` em modo padrão (CTA "Falar com o Coach") |
| `GET /diet/current` falha de rede | `EmptyDietState` em modo erro (CTA "Tentar de novo") |
| `POST /diet/generate` em andamento | Botão do chat: disabled + "Gerando sua dieta..." + spinner inline |
| `POST /diet/generate` falha | `Alert` + botão volta ao idle; mensagem com flag continua disponível |
| `PATCH complete` em andamento | UI já mudou (otimista); botão disabled enquanto `togglingMealId === meal.id` |
| `PATCH complete` falha | Reverte estado otimista + `Alert("Não foi possível marcar. Tente novamente.")` |

## 10. Testes

- `features/diet/store.test.ts`:
  - `loadCurrent` popula `plan`.
  - `generate` resolve com `DietPlan` e atualiza `plan`.
  - `toggleMealComplete` aplica otimista, e em erro reverte.
  - `clear` zera o estado.
- `features/coach/store.test.ts` (extensão):
  - mensagem com `canGenerateDiet: true` é preservada no store.
- Componentes:
  - `MealPlanCard` renderiza estado completed vs idle conforme `completedAt`.
  - `DietProgressHeader` calcula `X de Y` corretamente.
  - `EmptyDietState` renderiza variante normal vs erro.
  - `GenerateDietButton` atravessa idle → loading → idle nos cenários de erro.

Cobertura segue padrão do projeto (Jest + RTL).

## 11. Fora de escopo

- Editar refeições da dieta gerada (deletar item, trocar item, regenerar uma refeição).
- Histórico de dietas anteriores.
- Notificações push de lembrete por refeição.
- Sincronizar food-log manual com plano (ex: "comi outra coisa, recalcula").
- Modo offline real (cache do plano para uso sem rede).

Esses ficam pra iterações futuras.

## 12. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Backend ainda não tem os endpoints quando o front for testado | Adicionar `mocks/handlers/diet.ts` (MSW, alinhado ao padrão dos demais handlers — `auth.ts`, `coach.ts`, `food-log.ts`). Documentar contrato pro time backend. |
| LLM gerar campos faltantes ou nulos | Validar shape mínimo no service (lançar erro se faltar `id`, `meals`, ou se `meals.length !== 4`). Renderizar `EmptyDietState` em modo erro. |
| Dashboard ficar com lógica condicional confusa (com/sem dieta) | Extrair helper `computeDashboardMacros(plan, foodLogMeals)` para isolar a regra. |
| Usuário gerar dieta múltiplas vezes em sequência | Backend define a regra (substituir plano do dia). Front só refaz `loadCurrent` após sucesso. |
