# Plano: varredura ampla do coach

Spec: `docs/superpowers/specs/2026-11-05-varredura-ampla-do-coach.md`

Um branch (`feat/coach-varredura-ampla`), um commit por tarefa, com TDD (teste vermelho antes da
mudança). Nada nativo: o backend vai pela Vercel e o app por OTA, para iOS e Android. A ordem
vai do menor risco para o maior, e M3 (troca do fluxo de correção) fica por último no backend
para não bloquear o resto.

## T1 — Contexto: um peso, meta passada e ordem do corte (M7, M8, M9)
Arquivo: `backend/src/modules/chat/chat-context.ts`.
1. **M7:** a linha "Perfil" usa `lastWeight` com a origem `(Evolução, dd/mm)`, e a linha
   separada sai. A consulta de `weight_entries` ganha `created_at DESC` como desempate.
2. **M8:** função pura `remainingText(target, consumed, unit, label)` →
   - `Faltam 12 g de proteína`;
   - `Passou da meta em 350 kcal`;
   - `Meta atingida`.
3. **M9:**
   - nova ordem das linhas, com o aviso de registro impossível logo depois dos números do dia;
   - nome de registro cortado em 60 caracteres;
   - `CONTEXT_MAX_CHARS` = 3.600.
4. **Testes (`chat-context.test.ts`):**
   - um peso só;
   - sem número negativo;
   - contexto longo mantém o aviso e o perfil.
   - Snapshots revisados.

## T2 — Plano de hoje no contexto (M5)
1. `planLines(today)`: uma linha por refeição com horário, título, "(concluída)", kcal e até 6
   itens (`nome quantidade unidade`); acima disso, "+N itens". Entra depois do perfil (ordem de
   T1).
2. Instrução: perguntas sobre o plano usam o bloco; troca de item é sugerida, nunca dita como
   feita.
3. A linha "Próxima refeição do plano" continua (é número do dia).
4. Testes: plano com 2 refeições, uma concluída; refeição com 8 itens → "+2 itens".

## T3 — Resumo dos dias anteriores (M6, parte 1)
1. `fetchUserContext` chama `getSummary(from = date − 6, to = date − 1)` em try/catch → campo
   `recentDays`.
2. Linha `Últimos dias (só diário): dd/mm N kcal / P g prot · dd/mm sem registro · …`, mais a
   instrução de que refeições do plano de dias passados não aparecem.
3. Testes: 6 dias com 2 sem registro; falha do `getSummary` → linha ausente e o chat segue.

## T4 — O que o coach não faz (M1)
1. `CAPABILITIES_INSTRUCTION` em `chat.service.ts`, com o que faz, o que não faz e o caminho no
   app de cada item. Entra em `assembleSystemPrompt` logo depois do prompt base.
2. `EXISTING_DIET_INSTRUCTION`: "peso novo não é pedido de plano novo; indique a Evolução".
3. Teste do prompt (`chat.prompts.test.ts`) e snapshot.
4. Eval: 5 casos em `coach-conversations.json` (registrar, apagar, marcar, peso com dieta, trocar
   item), todos com `expectToolName: null`.

## T5 — Histórico com hora e com teto (M2 backend, M10)
1. `getChatHistory` devolve `created_at` (o `at` da mensagem) quando existe. Schema da rota
   atualizado (opcional, para não quebrar).
2. `persistHistory` grava só as últimas 400 mensagens (`HISTORY_MAX_MESSAGES`). `getChatHistory`
   devolve as últimas 200 (`HISTORY_PAGE`).
3. Testes: `created_at` presente e ausente; 450 mensagens → 400 gravadas; GET → 200.

## T6 — Correção por proposta (M3, M4, M6 parte 2)
Arquivos: `backend/src/modules/chat/meal-correction.ts`, `chat.service.ts`, `chat.schemas.ts`.
1. **Tool:** `UPDATE_LOGGED_MEAL_TOOL` → `PROPOSE_MEAL_CORRECTION_TOOL`, com os mesmos campos e a
   descrição "propõe; o usuário confirma no app".
2. **`applyMealCorrection` → `proposeMealCorrection`:**
   - busca a ref nos últimos 7 dias, com um `listMeals` por dia, ou com uma consulta única por
     `meal_date BETWEEN` se o teste de desempenho pedir;
   - valida e normaliza como hoje;
   - **não chama `updateMeal`**;
   - devolve a proposta e o texto montado pelo servidor com os valores normalizados.
3. **Instrução nova:** quando o usuário apontar o erro, chame a tool já na primeira resposta (sem
   pedir "posso atualizar?") — o botão é a confirmação.
4. **Resposta e marca do app:**
   - `chatMessageBodySchema` ganha `client_features` (array opcional de strings);
   - com `meal_proposal` na lista, o servidor oferece `PROPOSE_MEAL_CORRECTION_TOOL`; sem
     ela, mantém `UPDATE_LOGGED_MEAL_TOOL`;
   - a resposta ganha `meal_proposal` (schema novo, opcional).
5. **Testes (`meal-correction.test.ts`, `chat.service.gating.test.ts`):**
   - ref de 5 dias atrás → encontrada; de 8 dias → `NOT_FOUND` com o texto "últimos 7 dias";
   - kcal incoerente → a proposta já vem recalculada, e o texto cita o número recalculado;
   - `updateMeal` nunca é chamado;
   - tools oferecidas com e sem job.
6. **M11 junto:** tetos em `replaceDietItemBodySchema`, com teste de schema.
7. `docs/operacao-ia.md`: o log "Registro corrigido pelo coach" passa a ser "Correção proposta
   pelo coach". A gravação aparece no log do PATCH.

## T7 — App: cartão da proposta (M3)
1. `coach.service.ts`: envia `client_features: ['meal_proposal']` e mapeia `meal_proposal` →
   `CoachMessage.mealProposal`.
2. Componente `MealProposalCard`:
   - mostra o nome antigo → o nome novo, o peso e os valores;
   - botões "Atualizar registro" e "Agora não";
   - estados: salvando, salvo ("Registro atualizado") e erro ("Não consegui salvar. Tente de
     novo").
3. **Store do coach:** `applyProposal(messageId)` chama `foodLogService.updateMeal(id, {name,
   values, weightGrams, mealType})` e depois `refreshCorrectedDay(date)`. O `mealType` vem do
   registro no store do Diário. Se ele não estiver carregado, busca o dia antes.
4. **`CoachScreen`:** renderiza o cartão abaixo da bolha que tem `mealProposal`.
5. **Testes:**
   - render do cartão;
   - aplicar → PATCH e refresh;
   - "Agora não" → some;
   - erro → mensagem e botão de novo.

## T8 — App: datas no chat e rascunho com ref (M2 app, M6 parte 3)
1. `getHistory` usa `created_at` quando vem. Sem ele, `timestamp` fica `null`, e a `ChatBubble`
   não mostra a hora.
2. **Separadores de dia no `CoachScreen`:** função pura `daySeparators(messages, today)` →
   "Hoje", "Ontem" ou "dd/mm"; "Conversas anteriores" para o bloco sem data no topo.
3. **`correctionDraft(meal, date)`:** inclui `dd/mm · ref xxxxxx`. A ref vem do mesmo algoritmo
   do backend (6 primeiros caracteres do id, sem hífens).
4. **`AddMealModal`:** o link "Corrija com o coach" só aparece se a data do registro for de até 6
   dias atrás.
5. **Testes:**
   - `daySeparators` (hoje, ontem, data, sem data);
   - `ChatBubble` sem horário;
   - rascunho com ref;
   - link ausente em um registro de 8 dias.

## T9 — Entrega
1. Suítes completas: backend (`vitest`, `biome`, `tsc`) e app (`jest`, `tsc`, lint).
2. PR, CI verde, merge, OTA (conferir os 7 runtimes no `eas update:list`) e deploy na Vercel.
3. **Verificação em produção sem login:**
   - POST de troca de item com 999.999 kcal → 400 de validação;
   - bundle web com "Atualizar registro" e "Conversas anteriores".
4. **Fica pendente de chave de IA:** rodar `RUN_AI_EVALS=1` (casos de M1 e da proposta) e um
   teste manual no celular: registrar um item, abrir "Corrija com o coach", ver o cartão e tocar
   em Atualizar.

## Ordem e dependências
- T1–T5 são independentes entre si; T2 e T3 dependem da ordem de linhas de T1.
- T7 depende de T6, e T8 depende de T5 (`created_at`) e de T6 (janela de 7 dias).
- Compatibilidade:
  - um app antigo, sem o OTA, que receba `meal_proposal` ignora o campo e mostra só o texto;
  - o texto diz "toque em Atualizar registro", botão que esse app não tem;
  - para esse caso, o servidor só usa a tool de proposta se a requisição trouxer
    `client_features: ['meal_proposal']`, enviado pelo app novo;
  - sem essa marca, o servidor oferece a tool de 04/11 (grava direto), como hoje.
