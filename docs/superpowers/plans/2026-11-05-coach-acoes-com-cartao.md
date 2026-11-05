# Plano: o coach faz as ações que hoje recusa, com cartão de confirmação

Spec: `docs/superpowers/specs/2026-11-05-coach-acoes-com-cartao.md`

Branch `feat/coach-acoes-cartao`. Um commit por tarefa, com TDD. Backend pela Vercel e app por
OTA; não há migração. Reaproveita o padrão de `propose_meal_correction` (PR #96).

## T1 — Base comum das ações
Arquivos: `backend/src/modules/chat/` (novo `action-proposals.ts`), `chat.schemas.ts`,
`chat.service.ts`.
1. **`client_features` reconhecidas:** `meal_proposal` (já existe), `log_meal`, `log_weight` e
   `complete_plan_meal`.
2. **`capabilitiesInstruction(features)`:** troca a constante `CAPABILITIES_INSTRUCTION`.
   - Sem nenhuma marca nova, o texto é idêntico ao atual (teste de igualdade).
   - Com marcas, cada ação sai de "não consegue" e entra em "consegue propor (o usuário confirma
     no cartão)".
3. **`chatResponseSchema.action_proposal`:** união discriminada por `kind`, opcional e nula.
4. **Roteamento:** `toolsFor(features, pendingJob)` monta a lista de tools. O ramo de tool calls
   vira um mapa `nome → handler`, e uma tool não oferecida cai no caminho de "tool desconhecida",
   como hoje.
5. **Testes:**
   - instrução sem marcas = texto atual;
   - com cada marca, o texto muda;
   - tools oferecidas por combinação de marcas e com job pendente;
   - snapshot do prompt.

## T2 — Adicionar ao Diário (A1)
1. **Tool `propose_log_meal`.** Validação extraída de `resolveCorrection` para uma função comum
   `normalizeMealValues(values, weightGrams)`: tetos, macros ≤ peso e kcal pelos macros. A
   correção passa a usar a mesma função (refatoração com os testes atuais verdes).
2. **Datas:** `today`/`yesterday` → data local a partir de `context.date`. O nome é limitado a
   120 caracteres.
3. **Texto do servidor:** `Para registrar no café da manhã de hoje: "2 ovos cozidos" (100 g) —
   155 kcal · P 13 g · C 1 g · G 11 g. Toque em Adicionar ao Diário para salvar.`
4. **Testes:**
   - proposta válida;
   - kcal recalculada;
   - macros acima do peso → texto, sem proposta;
   - "yesterday" vira a data certa;
   - nada é gravado (`addMeal` não é chamado).

## T3 — Registrar na Evolução (A2)
1. **Tool `propose_log_weight`.** Valida contra `BODY_LIMITS`. Consulta o peso da data
   (`replaces`) e o último registro anterior (`bigChange` se a diferença passar de 5 kg).
2. **Texto:** inclui a substituição e o aviso quando houver. Nenhuma chamada a `collect_diet_data`
   é oferecida junto, porque a tool da dieta continua sujeita a `EXISTING_DIET_INSTRUCTION`.
3. **Testes:**
   - sem registro no dia;
   - com registro (`replaces`);
   - salto de 7 kg (`bigChange`);
   - 0,5 kg → texto, sem proposta;
   - `upsertEntry` nunca é chamado.

## T4 — Marcar refeição do plano (A3)
1. **`planLines`:** cada refeição ganha `[plano xxxxxx]` (6 primeiros caracteres do id, sem
   hífens). Testes de contexto e snapshot atualizados.
2. **Tool `propose_complete_plan_meal`:**
   - resolve a ref no `context.today`;
   - refeição já concluída → texto "já está marcada", sem proposta;
   - ref inexistente → texto.
3. **Toggle idempotente:**
   - `toggleMealBodySchema` ganha `completed?: boolean`;
   - em `toggleMealCompleted`, com `completed` informado, o estado final é o pedido (marca ou
     desmarca conforme o valor, nunca inverte);
   - sem ele, o comportamento atual se mantém, inclusive o caminho dos apps sem
     `tzOffsetMinutes`.
4. **Testes:**
   - toggle com `completed: true` duas vezes continua marcado;
   - `completed: true` com a refeição já marcada não desmarca;
   - sem `completed`, os testes atuais de `toggle-meal.test.ts` passam iguais;
   - tool: proposta, já concluída, ref inválida.

## T5 — App: cartões
Arquivos: `app/src/shared/services/coach.service.ts`, `features/coach/store.ts`, novo
`components/ActionProposalCard.tsx`, `CoachScreen.tsx`, `diet.service.ts`.
1. **Serviço:** `client_features` passa a enviar as 4 marcas e mapeia `action_proposal` para
   `CoachMessage.actionProposal`.
2. **`diet.service.toggleMeal(mealId, { completed })`:** parâmetro opcional; o toque da tela Hoje
   não muda.
3. **Store `applyAction(messageId)`:**
   - **`log_meal`:** `foodLogService.addMeal({..., date, mealType})`, depois
     `useFoodLogStore.addMeal`;
   - **`log_weight`:** `weightService.addEntry`, depois atualiza o store da Evolução;
   - **`complete_plan_meal`:** `dietService.toggleMeal(id, { completed: true })`, depois recarrega
     o plano do dia.

   Estados: `idle`, `saving`, `saved`, `error`, `dismissed`, os mesmos de `ProposalCard`. Fica um
   único tipo `CardStatus` compartilhado.
4. **`ActionProposalCard`:** um componente com 3 corpos por `kind` e os mesmos botões e estados
   do `MealProposalCard`. O aviso de `bigChange` e o "substitui X kg" aparecem no corpo do peso.
5. **Testes:**
   - cada `kind` renderiza e aplica com a chamada certa;
   - erro mantém o botão;
   - dois toques em "Marcar como feita" fazem uma chamada só (o estado `saving` bloqueia);
   - o serviço envia as marcas.

## T6 — Eval, documentação e entrega
1. **Eval:**
   - 3 casos com as marcas ("registra 2 ovos", "meu peso é 78", "marca meu almoço"), cada um
     esperando a sua tool;
   - os 5 casos de M1 seguem sem marcas (sem tool);
   - "apaga esse registro" com marcas continua sem tool.
2. **`docs/operacao-ia.md`:** as 3 tools novas, os logs (`Ação proposta pelo coach: <kind>`) e o
   aviso de que todas marcam `tool_called` (consulta de loop).
3. Suítes completas, PR, CI, merge (com autorização no chat), OTA nos 7 runtimes e Vercel.
4. **Verificação sem login:** PATCH de toggle com `completed: "x"` → 400 de validação; bundle web
   com "Adicionar ao Diário", "Registrar na Evolução" e "Marcar como feita".
5. **Para o usuário (teste no celular):** "registra 2 ovos no café", "meu peso hoje é X" e "marca
   meu almoço". Em cada um, conferir o cartão, tocar e ver a tela correspondente.

## Ordem e dependências
- T1 primeiro. T2, T3 e T4 dependem dela e são independentes entre si.
- T5 depende de T2–T4.
- **Recomendação:** fazer antes o item 4 da lista de expansões (cartão que volta ao reabrir o
  chat e marcador de ação aplicada). Com 4 tipos de cartão, um texto "toque em …" sem botão depois
  de reabrir o chat passa a aparecer bem mais.
