# Plano: coach antenado aos registros

Spec: `docs/superpowers/specs/2026-11-04-coach-antenado-aos-registros.md`

Um branch, um commit por tarefa, com TDD (teste vermelho antes da correção). Nada nativo: o app vai
por OTA para iOS e Android.

## T1 — Registros do dia no contexto (A1)
1. `listMeals` passa a devolver `weightGrams` (soma de `meal_items.quantity_g`). Teste em
   `food-log.service.test.ts`.
2. `formatUserContext` ganha o bloco "Registros de hoje no diário", com no máximo 8 itens, mais
   recentes primeiro e `ref` de 6 caracteres, sem os impossíveis. Inclui também os nomes das
   refeições do plano concluídas. Junto vem a instrução de usar a lista. `CONTEXT_MAX_CHARS`
   passa a 2.400. Testes em `chat-context.test.ts`.

## T2 — Coach responde à mensagem de agora (A2)
1. `ChatHistoryMessage` ganha `at?: string`. As mensagens novas, do usuário e do coach, são
   gravadas com `at`.
2. `loadHistory` devolve também `updated_at`.
3. Função pura `toModelMessages(history, now, tzOffset, lastActivity)`:
   - prefixa `[dd/mm hh:mm]` em quem tem `at`;
   - insere o marcador de retomada antes da última mensagem do usuário quando a pausa passa
     de 6 h;
   - devolve só `{role, content}`.
4. Instrução fixa: responder sempre à última mensagem.
5. `GET /chat/history` continua devolvendo só `role` e `content`.
6. Testes da função pura e do envio ao modelo (`chat.service.test.ts`).

## T3 — Tool `update_logged_meal` (A3)
1. Definição da tool e da instrução de uso (só após confirmação). Com geração de dieta em voo,
   só essa tool é oferecida.
2. `applyMealCorrection(fastify, userId, args, date)`:
   - resolve o `ref` entre as refeições de hoje e de ontem do usuário;
   - valida os tetos e a regra macros ≤ peso;
   - corrige a kcal incoerente;
   - chama `updateMeal` mantendo o peso e o tipo da refeição.
3. `chatResponseSchema` ganha `meal_updated: { id, date } | null`.
4. App: `coach.service` mapeia `meal_updated`, e o store do coach recarrega o Diário daquela
   data.
5. Testes:
   - backend: sucesso, ref inválida, ref de outro dia, valores impossíveis;
   - app: refresh.

## T4 — Último peso da Evolução (A4)
`fetchUserContext` busca o último `weight_entries` plausível. Uma linha nova no contexto. Testes.

## T5 — "Corrigir com o coach" (A5)
1. O store do coach ganha `draft` e `setDraft`. O `ChatInput` usa o rascunho quando ele existe.
2. `AddMealModal`, no modo edição, ganha o link. O `FoodLogScreen` fecha o modal, grava o
   rascunho e navega para Coach.
3. Testes do modal e do store.

## T6 — Eval, documentação e entrega
1. Dois casos novos no eval (`coach-conversations.json`).
2. `docs/operacao-ia.md`: a tool nova conta em `tool_called`, então a consulta de "loop de
   geração" passa a filtrar pela chamada da dieta (`finish_reason`/conversa) e isso fica
   anotado.
3. Suítes completas, PR, merge e OTA. Verificação em produção com requisições sem token e com o
   `eas update:list`.
