# Feedbacks cardápio/coach/biotipo/refeição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar os 4 feedbacks de uso (fibra + nomes por extenso no cardápio, coach usar dados do cadastro, biotipo leigo com "Ajude-me a descobrir", corrigir "marcar refeição como concluída") e publicar via OTA.

**Architecture:** Backend Fastify + postgres.js (Supabase) com testes vitest e fake-fastify; app React Native com jest + @testing-library/react-native. Backend vai pelo deploy da Vercel no merge; app vai por OTA (`.github/workflows/ota-update.yml`).

**Tech Stack:** TypeScript, Fastify, Zod, postgres.js, OpenAI Structured Outputs, React Native 0.85, Zustand, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-feedbacks-cardapio-coach-biotipo.md`

## Global Constraints

- Nada nativo muda (nenhum arquivo em `app/android`, `app/ios`, `app.json`, nenhuma dependência nova): o OTA precisa manter o fingerprint.
- Textos de UI em português do Brasil.
- Rótulos dos chips: `Proteína {n}g`, `Carboidrato {n}g`, `Gordura {n}g`, `Fibra {n}g`; kcal continua `{n} kcal`.
- Rótulos de biotipo exatamente: `Magro / Acelerado (Ectomorfo)`, `Atlético / Versátil (Mesomorfo)`, `Largo (Endomorfo)`, `Ajude-me a descobrir`.
- Valores enviados ao backend continuam `ectomorph | mesomorph | endomorph | unknown`.
- Colunas de fibra são nullable; dieta antiga = `null`, nunca `0`.
- O backend deve funcionar ANTES e DEPOIS da migration 020 ser aplicada.
- Gates: `cd backend && npm run typecheck && npm test`; `cd app && npm run type-check && npm test`.
- Commits pequenos por task, mensagens em português no estilo `fix(diets): ...` / `feat(app): ...`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Banco sem a coluna de fibra (migration não aplicada) → geração de dieta e `GET /diets/today` continuam funcionando, `fiber: null`.
2. Usuário antigo (onboarding velho, sem sexo/idade/atividade) → coach pergunta só o que falta, nunca peso/altura conhecidos.
3. `goal = 'health'` vindo do perfil → coach não repergunta objetivo; tool recebe `maintain`.
4. Fluxo "Ajude-me a descobrir" com empate de pontuação → resultado determinístico (mesomorfo) e o onboarding continua no passo seguinte.
5. Toggle de refeição falhando na rede → alerta aparece uma vez e não sobra unhandled promise rejection.

---

### Task 1: Corrigir "marcar refeição como concluída" (F4)

**Files:**
- Modify: `backend/src/modules/diets/diets.service.ts` (~L423-429, UPDATE em `toggleMealCompleted`)
- Test: `backend/src/modules/diets/toggle-meal.test.ts`
- Modify: `app/src/features/diet/components/MealPlanCard.tsx` (~L50-54)
- Test: `app/src/features/diet/components/MealPlanCard.test.tsx`

**Interfaces:** nenhuma mudança de contrato.

- [ ] **Step 1: Teste de regressão (backend).** Em `toggle-meal.test.ts`, usando o fake que já grava o SQL, adicionar:

```ts
it('não escreve updated_at em diet_meals (a coluna não existe — 006_diets.sql)', async () => {
  // reaproveitar o arrange do teste "marca refeição" existente
  // ...
  const updateSql = recordedSql.find((s) => s.includes('UPDATE diet_meals'))
  expect(updateSql).toBeDefined()
  expect(updateSql).not.toMatch(/updated_at/)
})
```
(adaptar nomes `recordedSql`/arrange ao helper que o arquivo já usa).

- [ ] **Step 2:** `cd backend && npx vitest run src/modules/diets/toggle-meal.test.ts` → FAIL.
- [ ] **Step 3:** Remover a linha `updated_at   = NOW()` do UPDATE (ajustar a vírgula da linha anterior). Comentário curto acima: `-- diet_meals não tem updated_at (006_diets.sql)`.
- [ ] **Step 4:** Rodar de novo → PASS.
- [ ] **Step 5 (app):** Em `MealPlanCard.tsx`, o `onPress` faz `onToggleComplete(meal.id)` sem tratar a rejeição (o store já mostra `showAlert` e relança). Trocar por:

```tsx
onPress={() => {
  // O store já avisa o usuário e desfaz o otimista; aqui só evita a rejeição solta.
  Promise.resolve(onToggleComplete(meal.id)).catch(() => {});
}}
```
Teste em `MealPlanCard.test.tsx`: `onToggleComplete = jest.fn().mockRejectedValue(new Error('x'))`, pressionar "Marcar como concluída", `await` um tick e verificar que não lança (o teste não falha por rejeição não tratada) e que o mock foi chamado com o id.
- [ ] **Step 6:** `cd app && npx jest src/features/diet` → PASS.
- [ ] **Step 7:** Commit `fix(diets): marcar refeição como concluída não escreve mais updated_at inexistente`.

---

### Task 2: Fibra no backend (F1-backend)

**Files:**
- Create: `backend/supabase/migrations/020_diet_fiber.sql`
- Modify: `backend/src/shared/diet-ai-schema.ts` (`aiDietItemSchema`)
- Modify: `backend/src/modules/diets/jobs.service.ts` (prompt ~L170-245; inserts ~L555-580; `dayTotals`)
- Modify: `backend/src/modules/diets/diets.service.ts` (`getTodayPlan` ~L270-315; `DbDietMeal` type)
- Modify: `backend/src/modules/diets/diets.schemas.ts` (`plannedMealSchema`)
- Create: `backend/src/modules/diets/fiber-columns.ts`
- Tests: `backend/src/modules/diets/fiber-columns.test.ts`, testes existentes de jobs/today

**Interfaces:**
- Produces: `GET /diets/today` → cada refeição ganha `fiber: number | null`.
- Produces: `hasFiberColumns(fastify): Promise<boolean>` em `fiber-columns.ts`.

- [ ] **Step 1: Migration** `020_diet_fiber.sql`:

```sql
-- Fibra na dieta (feedback 2026-10-05). Nullable de propósito: dieta gerada
-- antes desta migration não tem o dado — "sem informação", não "0 g".
ALTER TABLE public.diet_items ADD COLUMN IF NOT EXISTS fiber_g     NUMERIC(8,2);
ALTER TABLE public.diet_meals ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);
ALTER TABLE public.diet_days  ADD COLUMN IF NOT EXISTS total_fiber NUMERIC(8,2);
```

- [ ] **Step 2: Teste de `hasFiberColumns`** (fake-fastify de `backend/src/shared/testing/fake-fastify.ts`): (a) query a `information_schema.columns` retorna 3 linhas → `true`; (b) retorna 0 linhas → `false`; (c) depois de `true`, segunda chamada não consulta de novo; (d) depois de `false`, consulta de novo na próxima chamada (a migration pode ter sido aplicada no meio).
- [ ] **Step 3: Implementar** `fiber-columns.ts`:

```ts
import type { FastifyInstance } from 'fastify'

/**
 * As migrations rodam à mão no SQL Editor do Supabase — o deploy pode chegar
 * antes da 020. Sem as colunas, a dieta é gravada como antes (sem fibra).
 * Só o "sim" fica em cache: depois que a migration roda, não volta a sumir.
 */
let known = false

export async function hasFiberColumns(fastify: FastifyInstance): Promise<boolean> {
  if (known) return true
  const rows = await fastify.db<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'diet_items' AND column_name = 'fiber_g')
        OR (table_name IN ('diet_meals', 'diet_days') AND column_name = 'total_fiber'))
  `
  known = (rows[0]?.n ?? 0) === 3
  return known
}

/** Só para testes. */
export function __resetFiberColumnsCache(): void {
  known = false
}
```
(ajustar ao formato de retorno que o fake-fastify usa.)

- [ ] **Step 4: Schema da IA.** `aiDietItemSchema` ganha `fiber_g: z.number()` (depois de `fat_g`). Atualizar fixtures de testes que constroem itens (grep `protein_g:` em `backend/src`) adicionando `fiber_g`. Se houver limites de plausibilidade por item no mesmo arquivo, aceitar `fiber_g` entre 0 e 60.
- [ ] **Step 5: Prompt.** No prompt de geração do dia em `jobs.service.ts`, onde pede "calorias/macros por item", incluir fibra: `calorias, proteína, carboidrato, gordura e fibra (g) por item`. Atualizar snapshots se houver (`npx vitest run -u` só no arquivo afetado, conferindo o diff).
- [ ] **Step 6: Persistência.** Antes do `fastify.db.begin`, `const withFiber = await hasFiberColumns(fastify)`. `dayTotals` passa a devolver também `fib`. Dentro da transação, ramificar os 3 INSERTs: com `withFiber` incluem `total_fiber`/`fiber_g` (soma `i.fiber_g` para refeição e dia); sem, ficam exatamente como hoje. Teste: com o fake devolvendo `n=3`, o SQL do INSERT em `diet_items` contém `fiber_g`; com `n=0`, não contém.
- [ ] **Step 7: Leitura.** Em `getTodayPlan`, no SELECT de `diet_meals`, adicionar
  `(to_jsonb(diet_meals) ->> 'total_fiber')::numeric AS total_fiber` (funciona sem a coluna: devolve NULL). Tipo `DbDietMeal` ganha `total_fiber: string | number | null`. No map: `fiber: dbMeal.total_fiber == null ? null : Number(dbMeal.total_fiber)`.
- [ ] **Step 8: API schema.** `plannedMealSchema` ganha `fiber: z.number().nullable()`. Atualizar testes de `getTodayPlan`/rota que comparam o objeto inteiro.
- [ ] **Step 9:** `cd backend && npm run typecheck && npm test` → PASS.
- [ ] **Step 10:** Commit `feat(diets): fibra por item/refeição/dia na dieta gerada (tolerante à migration 020)`.

---

### Task 3: Cardápio mostra nomes por extenso + fibra (F1-app)

**Files:**
- Modify: `app/src/shared/services/diet.service.ts` (`PlannedMeal`)
- Modify: `app/src/features/diet/components/MacroChips.tsx`
- Modify: `app/src/features/diet/components/MealPlanCard.tsx` (L38)
- Create: `app/src/features/diet/components/MacroChips.test.tsx`
- Modify: fixtures de `PlannedMeal` em testes (grep `completedToday:` em `app/src`) adicionando `fiber`.

**Interfaces:**
- Consumes: `GET /diets/today` → `fiber: number | null` (Task 2). Campo ausente (backend antigo) deve ser tratado como `null`.

- [ ] **Step 1: Teste** `MacroChips.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { MacroChips } from './MacroChips';

describe('MacroChips', () => {
  it('mostra os nomes por extenso, sem abreviação', () => {
    const { getByText, queryByText } = render(
      <MacroChips kcal={450} protein={20} carbs={50} fat={10} fiber={6} />,
    );
    getByText('450 kcal');
    getByText('Proteína 20g');
    getByText('Carboidrato 50g');
    getByText('Gordura 10g');
    getByText('Fibra 6g');
    expect(queryByText('P 20g')).toBeNull();
  });

  it('esconde a fibra quando a dieta não tem o dado (null/undefined)', () => {
    const { queryByText } = render(<MacroChips kcal={450} protein={20} carbs={50} fat={10} fiber={null} />);
    expect(queryByText(/Fibra/)).toBeNull();
    const r2 = render(<MacroChips kcal={450} protein={20} carbs={50} fat={10} />);
    expect(r2.queryByText(/Fibra/)).toBeNull();
  });
});
```
- [ ] **Step 2:** `cd app && npx jest MacroChips` → FAIL.
- [ ] **Step 3: Implementar.** Props ganham `fiber?: number | null`. Textos `Proteína {protein}g`, `Carboidrato {carbs}g`, `Gordura {fat}g`; chip de fibra condicional (`fiber != null`) com estilo neutro (`chipNeutral`/`textNeutral`). `PlannedMeal` ganha `fiber?: number | null` (opcional: backend anterior ao deploy não manda). `MealPlanCard` passa `fiber={meal.fiber}`.
- [ ] **Step 4:** `npx jest src/features/diet && npm run type-check` → PASS.
- [ ] **Step 5:** Commit `feat(app): cardápio com macros por extenso e fibra`.

---

### Task 4: Coach usa os dados do cadastro (F2-backend)

**Files:**
- Modify: `backend/src/modules/chat/chat.service.ts` (`KNOWN_DATA_INSTRUCTION` L72-77; enum de goal na tool ~L202; base prompt L16-39 se preciso)
- Modify: `backend/src/shared/diet-ai-schema.ts` (`collectedUserDataSchema` ~L83-102)
- Modify: `backend/src/modules/chat/chat-context.ts` (SELECT L101-104; `formatKnownData` L270-289; `formatUserContext`)
- Tests: `chat-context.test.ts`, `chat.service.test.ts`, `chat.prompts.test.ts` (+ snapshot), `backend/src/evals/fixtures/coach-conversations.json`

**Interfaces:**
- Consumes: colunas `profiles.gender`, `birth_date`, `activity_level`, `body_type`, `goal` (Task 5 passa a preenchê-las).

- [ ] **Step 1: Testes de contexto** (`chat-context.test.ts`):
  - perfil com `weight_kg: '80.50'` (string, como o postgres.js devolve DECIMAL) → DADOS JÁ CONHECIDOS contém `80.5` e não `80.50`.
  - perfil com `body_type: 'mesomorph'` → contém `biotipo: Atlético / Versátil (mesomorfo)`; com `'unknown'` ou null → não lista biotipo.
  - perfil com `goal: 'health'` → objetivo listado como `manter peso / melhorar saúde (use goal=maintain)`.
- [ ] **Step 2: Teste de instrução** (`chat.service.test.ts`): `assembleSystemPrompt(..., knownData com só peso/altura, ...)` contém a frase `NUNCA pergunte de novo` e `Pergunte apenas os dados obrigatórios que NÃO estão`.
- [ ] **Step 3:** Rodar → FAIL.
- [ ] **Step 4: Implementar.**
  - SELECT do perfil inclui `body_type`; `Number()` em `weight_kg`/`height_cm` ao montar o `ContextProfile`.
  - `formatKnownData`: linha de biotipo (labels `ectomorph → Magro / Acelerado (ectomorfo)`, `mesomorph → Atlético / Versátil (mesomorfo)`, `endomorph → Largo (endomorfo)`); `health` mapeado como acima. Biotipo é informativo, não conta como obrigatório.
  - `KNOWN_DATA_INSTRUCTION` passa a ser:

```ts
const KNOWN_DATA_INSTRUCTION =
  'INSTRUÇÃO: os DADOS JÁ CONHECIDOS vieram do cadastro do usuário. NUNCA pergunte de novo ' +
  'nenhum deles — use-os direto. Pergunte apenas os dados obrigatórios que NÃO estão na lista, ' +
  'um por vez. Ao começar a montar a dieta, diga em UMA frase quais dados do cadastro você vai ' +
  'usar (ex.: "Vou usar seu peso de 80 kg e altura de 1,75 m"), sem esperar confirmação, e siga ' +
  'para o primeiro dado que falta. Se TODOS os obrigatórios já constam, envie UMA mensagem ' +
  'resumindo-os e perguntando se algo mudou; se o usuário confirmar, chame collect_diet_data. ' +
  'Se o usuário disser que algo mudou, use o valor novo.'
```
  - Base prompt: a lista "DADOS QUE VOCÊ DEVE COLETAR" ganha a nota `(pule os que já constam em DADOS JÁ CONHECIDOS)`.
  - `collectedUserDataSchema.goal` e o enum da tool: aceitar `'health'` no schema via `z.preprocess` que mapeia `'health' → 'maintain'`, e manter o enum da tool sem `health` (a instrução de contexto já orienta `maintain`).
- [ ] **Step 5:** Atualizar snapshots: `npx vitest run src/modules/chat -u`, conferir o diff (só as instruções novas/biotipo mudaram). Adicionar caso de snapshot "pós-onboarding" (peso, altura, idade, sexo, objetivo, atividade; sem refeições/dia).
- [ ] **Step 6: Fixture de eval** em `coach-conversations.json`, no mesmo formato das existentes: `"pós-onboarding: só falta refeições/dia → não chama e não repergunta peso"`, knownData com peso 80, altura 175, idade 30, sexo masculino, objetivo perder peso, atividade moderada; usuário diz "quero montar minha dieta"; espera `shouldCallTool: false` (seguir o campo que as fixtures existentes usam). Se o arquivo de eval suportar asserção de texto, exigir que a resposta não contenha "peso" seguido de "?".
- [ ] **Step 7:** `cd backend && npm run typecheck && npm test` → PASS. (Eval é opt-in `RUN_AI_EVALS=1`; não rodar sem chave.)
- [ ] **Step 8:** Commit `feat(chat): coach usa os dados do cadastro e só pergunta o que falta`.

---

### Task 5: Onboarding coleta sexo, idade e nível de atividade (F2-app)

**Files:**
- Modify: `app/src/features/auth/screens/ProfileSetupScreen.tsx`
- Modify: `app/src/shared/services/auth.service.ts` (`ProfileSetupPayload`, `profileSetup`)
- Test: `app/src/features/auth/screens/ProfileSetupScreen.test.tsx`

**Interfaces:**
- Produces: `PUT /users/me/profile` com `gender: 'male'|'female'`, `birth_date: 'YYYY-07-01'`, `activity_level: 'sedentary'|'light'|'moderate'|'active'|'very_active'` (enums já aceitos pelo backend).
- Produces (para Task 6): `type Step` inclui `'sex' | 'age' | 'activity'`; ordem `['name','sex','age','bodyType','height','weight','activity','goal','personality','gender']` (10 passos).

- [ ] **Step 1: Testes.** Atualizar o helper `completeOnboarding` para os passos novos e asserções de progresso (`'N / 10'`). Novos testes:
  - `validateStep('age', '30')` → ok `'30'`; `'12'`, `'101'`, `'abc'` → erro com motivo amigável.
  - Concluir o onboarding escolhendo Feminino, 30 anos, "Moderado" → `authService.profileSetup` chamado com `sex: 'female'`, `age: 30`, `activityLevel: 'moderate'`; e `auth.service` envia `gender: 'female'`, `birth_date: '<anoAtual-30>-07-01'`, `activity_level: 'moderate'` (teste do service com `api.put` mockado, ou estender o existente).
- [ ] **Step 2:** `npx jest ProfileSetupScreen` → FAIL.
- [ ] **Step 3: Implementar.**
  - Perguntas: `sex: 'Qual é o seu sexo? (usamos para calcular suas calorias)'`, `age: 'Quantos anos você tem?'`, `activity: 'Com que frequência você se exercita?'`, e `gender: 'Qual o gênero do seu mentor (o coach)?'`.
  - Opções `sex`: 👨 Masculino `male`, 👩 Feminino `female` (descrição vazia).
  - Opções `activity`: 🛋️ Sedentário `sedentary` "Pouco ou nenhum exercício"; 🚶 Leve `light` "1 a 3 vezes por semana"; 🏃 Moderado `moderate` "3 a 5 vezes por semana"; 🏋️ Ativo `active` "6 a 7 vezes por semana"; 🔥 Muito ativo `very_active` "Treino intenso ou 2x por dia".
  - `validateStep('age')`: inteiro 13–100 via `parseNumber` + `Number.isInteger(Math.round(n))`; mensagens no tom das existentes.
  - `ProfileSetupPayload` ganha `sex: 'male' | 'female'`, `age: number`, `activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'`. `profileSetup` envia `gender: data.sex`, `birth_date: \`${new Date().getFullYear() - data.age}-07-01\``, `activity_level: data.activityLevel`.
- [ ] **Step 4:** `npx jest src/features/auth src/shared/services && npm run type-check` → PASS.
- [ ] **Step 5:** Commit `feat(onboarding): pergunta sexo, idade e nível de atividade para o coach não repetir`.

---

### Task 6: Biotipo em linguagem leiga + "Ajude-me a descobrir" (F3)

**Files:**
- Create: `app/src/features/auth/bodyTypeQuiz.ts`
- Create: `app/src/features/auth/bodyTypeQuiz.test.ts`
- Modify: `app/src/features/auth/screens/ProfileSetupScreen.tsx`
- Test: `app/src/features/auth/screens/ProfileSetupScreen.test.tsx`

**Interfaces:**
- Consumes: steps/fluxo da Task 5 (`advanceWithAnswer`, `OPTIONS`, `messages`).
- Produces: `BODY_TYPE_QUIZ: QuizQuestion[]`, `scoreBodyType(answers: BodyTypeKey[]): BodyTypeKey`, `BODY_TYPE_LABELS: Record<BodyTypeKey, string>` onde `type BodyTypeKey = 'ectomorph' | 'mesomorph' | 'endomorph'`.

- [ ] **Step 1: Testes** `bodyTypeQuiz.test.ts`:

```ts
import { BODY_TYPE_QUIZ, BODY_TYPE_LABELS, scoreBodyType } from './bodyTypeQuiz';

describe('scoreBodyType', () => {
  it('maioria vence', () => {
    expect(scoreBodyType(['ectomorph', 'ectomorph', 'endomorph'])).toBe('ectomorph');
    expect(scoreBodyType(['endomorph', 'mesomorph', 'endomorph'])).toBe('endomorph');
  });
  it('empate ou vazio → mesomorph', () => {
    expect(scoreBodyType(['ectomorph', 'mesomorph', 'endomorph'])).toBe('mesomorph');
    expect(scoreBodyType([])).toBe('mesomorph');
  });
  it('quiz tem 3 perguntas, cada uma com uma opção por biotipo', () => {
    expect(BODY_TYPE_QUIZ).toHaveLength(3);
    for (const q of BODY_TYPE_QUIZ) {
      expect(q.options.map((o) => o.value).sort()).toEqual(['ectomorph', 'endomorph', 'mesomorph']);
    }
  });
  it('labels leigos', () => {
    expect(BODY_TYPE_LABELS.mesomorph).toBe('Atlético / Versátil (Mesomorfo)');
  });
});
```
- [ ] **Step 2: Implementar** `bodyTypeQuiz.ts`:

```ts
export type BodyTypeKey = 'ectomorph' | 'mesomorph' | 'endomorph';

export const BODY_TYPE_LABELS: Record<BodyTypeKey, string> = {
  ectomorph: 'Magro / Acelerado (Ectomorfo)',
  mesomorph: 'Atlético / Versátil (Mesomorfo)',
  endomorph: 'Largo (Endomorfo)',
};

export type QuizQuestion = {
  question: string;
  options: { value: BodyTypeKey; emoji: string; title: string; description: string }[];
};

export const BODY_TYPE_QUIZ: QuizQuestion[] = [
  {
    question: 'Envolva o pulso com o polegar e o dedo médio da outra mão. O que acontece?',
    options: [
      { value: 'ectomorph', emoji: '👌', title: 'Os dedos se sobrepõem', description: 'Sobra espaço' },
      { value: 'mesomorph', emoji: '🤏', title: 'Os dedos só se encostam', description: 'Fecha certinho' },
      { value: 'endomorph', emoji: '✋', title: 'Os dedos não se encostam', description: 'Não fecha' },
    ],
  },
  {
    question: 'Como seu peso costuma reagir quando você come mais que o normal?',
    options: [
      { value: 'ectomorph', emoji: '🪶', title: 'Quase não muda', description: 'Tenho dificuldade de ganhar peso' },
      { value: 'mesomorph', emoji: '⚖️', title: 'Muda um pouco', description: 'Ganho, mas perco fácil também' },
      { value: 'endomorph', emoji: '📈', title: 'Sobe rápido', description: 'Ganho peso com facilidade' },
    ],
  },
  {
    question: 'Qual dessas descrições combina mais com o seu corpo?',
    options: [
      { value: 'ectomorph', emoji: '📏', title: 'Magro e alongado', description: 'Ombros e quadril estreitos' },
      { value: 'mesomorph', emoji: '💪', title: 'Atlético', description: 'Ganho músculo com facilidade' },
      { value: 'endomorph', emoji: '🧱', title: 'Mais largo e arredondado', description: 'Acumulo gordura na barriga/quadril' },
    ],
  },
];

/** Maioria simples; empate (ou sem respostas) cai em mesomorfo, o meio-termo. */
export function scoreBodyType(answers: BodyTypeKey[]): BodyTypeKey {
  const count: Record<BodyTypeKey, number> = { ectomorph: 0, mesomorph: 0, endomorph: 0 };
  for (const a of answers) count[a] += 1;
  const max = Math.max(count.ectomorph, count.mesomorph, count.endomorph);
  const winners = (Object.keys(count) as BodyTypeKey[]).filter((k) => count[k] === max);
  return winners.length === 1 ? winners[0] : 'mesomorph';
}
```
- [ ] **Step 3:** `npx jest bodyTypeQuiz` → PASS.
- [ ] **Step 4: Testes de tela** (`ProfileSetupScreen.test.tsx`):
  - No passo de biotipo aparecem os 4 títulos exatos da Global Constraints; não aparece `'Não sei'`.
  - Tocar "Ajude-me a descobrir" → aparece a pergunta do pulso como bolha do coach e as 3 opções; responder `Os dedos se sobrepõem`, `Quase não muda`, `Atlético` → aparece bolha contendo `Magro / Acelerado (Ectomorfo)` e a pergunta seguinte (altura); ao concluir o onboarding o payload tem `bodyType: 'ectomorph'`.
  - Progresso não avança durante as sub-perguntas (continua mostrando o mesmo `N / 10` do passo bodyType).
  - Atualizar `completeOnboarding` para tocar `'Magro / Acelerado (Ectomorfo)'` em vez de `'Ectomorfo'`.
- [ ] **Step 5: Implementar na tela.**
  - `OPTIONS.bodyType` com os títulos de `BODY_TYPE_LABELS` + `{ value: 'discover', emoji: '❓', title: 'Ajude-me a descobrir', description: 'O mentor faz algumas perguntas rápidas' }`; descrições conforme a spec.
  - Estado `quiz: { index: number; answers: BodyTypeKey[] } | null`. Ao escolher `discover`: push bolha do usuário "Ajude-me a descobrir", bolha do coach "Vamos descobrir juntos! 3 perguntas rápidas." + `BODY_TYPE_QUIZ[0].question`; `quiz = { index: 0, answers: [] }`.
  - Enquanto `quiz != null`, as opções renderizadas são `BODY_TYPE_QUIZ[quiz.index].options` (e o TextInput fica oculto/desabilitado, já que a resposta é por card). Cada toque: push bolha do usuário com o título, avança `index`; na última, `result = scoreBodyType(answers)`, push bolha do coach `Pelo que você me contou, seu biotipo é ${BODY_TYPE_LABELS[result]}.`, `quiz = null` e chama o mesmo caminho de `advanceWithAnswer(result, ...)` sem repetir a bolha do usuário (extrair a parte "gravar resposta + próxima pergunta" numa função interna se necessário).
  - O valor `'discover'` nunca vai para o payload; o fallback continua `'unknown'`.
- [ ] **Step 6:** `cd app && npx jest src/features/auth && npm run type-check` → PASS.
- [ ] **Step 7:** Commit `feat(onboarding): biotipo em linguagem leiga e "Ajude-me a descobrir" com perguntas do mentor`.

---

### Task 7: Entrega (controller)

- [ ] `cd app && npm run type-check && npm test`; `cd backend && npm run typecheck && npm test`; bundle Android de release (mesmo comando do CI).
- [ ] Conferir que nenhum arquivo nativo mudou: `git diff --name-only main | grep -E '^app/(android|ios)/|app.json|package(-lock)?.json'` → vazio. Conferir que o fingerprint não mudou: `cd app && npx expo-updates fingerprint:generate --platform ios` e `--platform android` na branch e na main, hashes iguais.
- [ ] Revisão final da branch inteira (subagent reviewer).
- [ ] Push, PR, CI verde, merge na `main` → Vercel faz deploy do backend; workflow **OTA update** publica no canal `production`.
- [ ] Acompanhar o run do OTA (`gh run watch`) e confirmar publicação para iOS e Android.
- [ ] Avisar o usuário: rodar `020_diet_fiber.sql` no SQL Editor do Supabase.
