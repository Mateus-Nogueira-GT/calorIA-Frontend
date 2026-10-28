# Plano: feedback do Eliton (limites da refeição e chat após gerar dieta)

Spec: `docs/superpowers/specs/2026-10-28-feedback-eliton-limites-refeicao-e-chat.md`

Ordem: primeiro confirmar a causa do chat (passo 0), porque ela decide o tamanho do C1.
R1/R2 e C2 não dependem disso e podem ir em paralelo. Cada bloco é um PR próprio, com
TDD (teste vermelho antes da correção).

---

## Passo 0 — Confirmar a causa do C1 (sem código)

1. Achar o `user_id` do Eliton no Supabase (`profiles` pelo nome/e-mail).
2. Rodar as três consultas da seção "Investigação" da spec e os logs da Vercel de 27/10
   (`Quota diária de IA excedida`).
3. Anotar no PR do C1: tokens de uma dieta completa (soma das 7 `diet_day`), tokens médios
   de uma mensagem de chat, e se o job da dieta de 6 refeições terminou ou falhou.
4. **Se a quota não for a causa:** parar o bloco C1 e reabrir a investigação com as
   hipóteses alternativas da spec (mensagem durante o job, `AI_TRUNCATED`). R1, R2 e C2
   seguem iguais.

Se o job ficou `failed` no meio, avisar o usuário que a dieta dele está incompleta e
usar o "Tentar de novo" (o `/retry` continua do dia em que parou).

---

## PR 1 — R1: limites no registro de refeição

### Backend
1. **Teste** em `backend/src/modules/food-log/food-log.service.test.ts` (ou um teste de
   schema novo): `addMealBodySchema` rejeita `calories: 999999`, `protein: 501`,
   `fiber: 151`, `Infinity`; aceita `calories: 5000`, `protein: 500`. O `updateMealBodySchema`
   herda os mesmos limites.
2. **Código** em `food-log.schemas.ts`: exportar as constantes
   ```ts
   export const MEAL_LIMITS = { calories: 5000, protein: 500, carbs: 500, fat: 500, fiber: 150 }
   ```
   e aplicar `.finite().max(MEAL_LIMITS.x, 'Máximo de … por refeição')` em cada campo.
3. Teste de integração (`food-log.integration.test.ts`): `POST /food-log` com 999999 → 400
   com a mensagem do campo.
4. Conferir se o scanner grava pelo mesmo endpoint/schema. Se gravar por outro caminho,
   aplicar os mesmos limites lá.

### App
5. Criar `app/src/features/food-log/meal-limits.ts` com os mesmos valores (comentário
   apontando para a constante do backend, que é a fonte da verdade) e a função pura
   ```ts
   checkAgainstGoals(meal, dayTotals, goals) → null | { dayCalories, dayPercent, reasons[] }
   ```
   implementando as três condições da spec (60% da meta na refeição, 150% no dia, macro >
   100% da meta). Teste unitário cobrindo cada condição, a ausência de meta e os limites
   exatos.
6. `AddMealModal.tsx`:
   - `parseMacro`/`parseFiber` passam a devolver erro por campo quando passa do limite;
     mostrar a mensagem embaixo do campo, como o `fieldError` já faz.
   - O modal recebe `dayTotals` e `goals` por props (o `FoodLogScreen` já tem os totais do
     dia; as metas vêm do mesmo `getDailyCalorieGoal(plan)`/`plan.total*` do Dashboard).
     Na edição, `dayTotals` desconta a refeição que está sendo editada.
   - Em `handleSubmit`, se `checkAgainstGoals` devolver aviso, abrir o diálogo de
     confirmação ("Revisar valores" / "Salvar mesmo assim") antes de `onSubmit`. Usar um
     modal do próprio app (não `Alert.alert`) para funcionar igual na web.
7. Testes em `AddMealModal.test.tsx`: erro no campo com 999999 sem chamar `onSubmit`;
   aviso aparece com 1.200 kcal e meta 1.695; "Revisar" não salva; "Salvar mesmo assim"
   salva; sem meta não há aviso.

## PR 2 — R2: tela Hoje fora da escala

1. Criar `formatGoalPercent(current, goal)` em `app/src/shared/utils/` → `'--'` sem meta,
   `'999%+'` acima de 999, senão `'N%'`. Teste unitário.
2. Usar em `CalorieRing.tsx:81`, `DashboardScreen.tsx:131` e `MacroCard.tsx:21`.
3. `MacroCard`: valor com separador de milhar (`toLocaleString('pt-BR')`), `numberOfLines={1}`
   e `adjustsFontSizeToFit`. Teste de snapshot/render com `current: 999999`.
4. Conferir no preview web (`npm run web -- --host 127.0.0.1`, `?preview=app`) em 360 px de
   largura com um registro de 999.999.

## PR 3 — C1: teto de IA por grupo de feature

Só depois do passo 0 confirmar a causa.

### Backend
1. **Teste vermelho** (`backend/src/shared/ai-usage.test.ts`): com 190k tokens de
   `diet_day` e 5k de `chat` nas últimas 24 h, `checkDailyQuota(fastify, uid, 'coach')` **não**
   lança; com 205k de `chat`, lança.
2. `checkDailyQuota(fastify, userId, group)`, com `group: 'coach' | 'vision' | 'diet'`, e um
   mapa `QUOTA_GROUPS = { coach: ['chat','transcribe','speech'], vision: ['vision'],
   diet: ['diet_day'] }`. A consulta filtra `feature = ANY(...)`.
3. Nova env `AI_DIET_DAILY_TOKEN_CAP` em `shared/env.ts`, com default = 2 × consumo medido
   de uma dieta no passo 0 (arredondado para cima). Documentar em `docs/operacao-ia.md`.
4. Atualizar os chamadores: chat e transcribe/speech → `'coach'`; scanner → `'vision'`;
   `processJobStep` (`jobs.service.ts:655`) → `'diet'`.
5. Devolver `retryAt` no erro `AI_QUOTA_EXCEEDED`: a consulta calcula a partir de que
   momento a soma da janela fica abaixo do teto (o `created_at` da chamada mais antiga que
   precisa sair + 24 h). Campo extra no corpo do erro; o `errorSchema` aceita opcional.
6. Teste de integração: gerar uma dieta completa com `diet` sobrando e `coach` no limite
   baixo de teste, depois mandar mensagem no chat → 200.
7. Confirmar que o 429 do chat não cobra crédito (a cobrança acontece depois de
   `checkDailyQuota`? Se for antes, corrigir a ordem e cobrir com teste em
   `chat.credits.test.ts`).

### Prompt
8. `EXISTING_DIET_INSTRUCTION` (`chat.service.ts:93`): para pedidos de alteração, confirmar
   antes dizendo que o plano dos 7 dias será refeito e as refeições marcadas hoje serão
   zeradas. Atualizar o snapshot em `__snapshots__` e adicionar um caso ao eval
   `src/evals/coach-tool-decision.eval.test.ts` ("muda minha dieta para 6 refeições" →
   sem tool na primeira resposta; "sim, pode refazer" → tool). O eval precisa de chave:
   rodar no CI ou em outra máquina (sem `OPENAI_API_KEY` local).

### App
9. `store.ts`: `QUOTA_MESSAGE` vira função que usa `retryAt` ("Ele volta a responder às
   HH:MM") e informa que nada foi cobrado. Teste em `store.test.ts`.

## PR 4 — C2: conclusão visível e marcadores fora da conversa

1. Mover `DIET_COMPLETED_MARKER` para `chat/history-markers.ts` junto do prefixo de início
   (o `jobs.service` importa de lá). `isInternalChatMarker` reconhece os dois. Teste em
   `chat.service.test.ts`.
2. `getChatHistory` filtra mensagens com `isInternalChatMarker` **só na resposta da rota**;
   o histórico que vai para o modelo continua com os marcadores. Teste: a rota não devolve
   colchetes; `loadHistory` interno continua devolvendo.
3. App: em `onDietJobCompleted` (`store.ts:555`), depois de `loadCurrent()`, adicionar uma
   mensagem local do coach com o número de refeições da dieta nova (do `useDietStore`) e
   ação "Ver dieta". Só adiciona se a conversa atual é a que gerou o job (comparar
   `conversationId`). Teste em `store.test.ts`.
4. Como a mensagem é local, ela some ao recarregar o histórico. Aceitável: ao recarregar, a
   dieta já está visível na aba. Se incomodar, o passo seguinte é o backend gravar essa
   frase (sem colchetes) no lugar do marcador de conclusão.

---

## Verificação final

- `cd backend && npm test` e `cd app && npm test` verdes.
- Preview web: registrar 999999 (bloqueado), 1.200 kcal com meta (aviso), tela Hoje com o
  registro antigo (999%+ em todo lugar).
- Em staging, com `AI_DAILY_TOKEN_CAP` baixo: gerar dieta, depois conversar no coach.
- Responder ao Eliton quando o PR 3 estiver em produção: agradecer o print, dizer que o
  pedido de 6 refeições funcionou e que o coach não vai mais travar depois de gerar a dieta.
