# Correções do debug de 18/10 — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** corrigir D01–D08 e o risco do 500 ambíguo do [relatório de 18/10](../../qa/debug-2026-10-18/RELATORIO.md) e transformar os testes de diagnóstico em regressões.

**Arquitetura:** um módulo `session-owner` define o dono de uma operação (`userId` + `sessionGeneration`) e um sinal que aborta na troca de sessão. O interceptor, os serviços e os stores param de produzir efeitos para um dono antigo. A pendência de crédito só é aposentada quando o store confirma que entregou o resultado (`acknowledge`). No backend, uma migration nova corrige a pseudonimização, e o prazo passa a ser validado com `clock_timestamp()` depois dos locks.

**Stack:** React Native 0.85 / Expo 56 / Zustand / axios 1.20 / Jest no app; Fastify / postgres.js / Vitest no backend; Supabase CLI para a migration.

**Spec:** [2026-10-18-correcoes-debug-sessao-creditos.md](../specs/2026-10-18-correcoes-debug-sessao-creditos.md)

## Restrições globais

- Nada em `app/android/` ou `app/ios/`. Antes de cada PR de app, `npx expo-updates fingerprint:generate --platform android` precisa dar `9a9173edf9fb0664f7f177227c1728169caaeb0b`, e `--platform ios` precisa dar `0aee9a097c7650b889b243718ef0bc7b92b57300`.
- A migration `20261016012212_credits_and_invites.sql` não é editada. Corrigir só com uma migration nova.
- Não aplicar migration no Supabase remoto, não publicar OTA e não ligar flags durante a implementação.
- `docs/ota-updates.md` (modificado) e `docs/research/2026-10-15-custo-ia-creditos-caloria.md` (não versionado) são trabalho do usuário. Fazer staging só de arquivos explícitos.
- Os arquivos de `docs/qa/debug-2026-10-18/` ficam como evidência e não são editados. As regressões ficam nas roots normais.
- Fixtures sem token, foto ou texto reais.
- Rodar a suíte completa do app com `cd app && npx jest` e a do backend com `cd backend && npm test`. Para os testes de PostgreSQL, usar `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:<porta>/credits_test`, só em banco descartável local.
- Uma branch por PR: `fix/sessao-isolamento` (Tasks 1–4), `fix/pendencias-recuperacao` (5–6), `fix/creditos-backend` (7–8), `fix/creditos-ui` (9–10).

## Foco de revisão

- **Login de volta como A no mesmo processo depois de um resultado descartado:** a mesma foto ou a mesma mensagem reusa a chave pendente e recebe o replay sem nova cobrança. É testado na Task 3.
- **Aborto da voz depois da resposta do servidor** (mesma conta): o resultado não aparece, mas fica recuperável em Créditos. É testado na Task 3.
- **Retry do coach (`retryLastAction`) atravessando logout:** não aplica nada e não aposenta a chave. É testado na Task 3.
- **Duas falhas ambíguas seguidas** (500 e depois 500): a chave é a mesma nas três tentativas. Um `409 OPERATION_FAILED` libera chave nova. É testado na Task 6.
- **Exclusão de conta sem nenhuma operação, ou só com operações `failed`:** continua funcionando. É testado na Task 7.

---

### Task 1: dono da sessão e interceptor que não troca de dono (R1, núcleo)

**Arquivos:**
- Criar: `app/src/shared/services/session-owner.ts`
- Criar: `app/src/shared/services/session-owner.test.ts`
- Modificar: `app/src/shared/services/api.ts:33-45` (interceptor de request) e o topo do arquivo (augmentation do axios)
- Teste: `app/src/shared/services/api.refresh.test.ts` (acrescentar casos)

**Interfaces:**
- Produz:
  - `interface SessionOwner { userId: string | undefined; generation: number }`
  - `captureSessionOwner(): SessionOwner`, que lê `user?.id` e `sessionGeneration` do `useAuthStore`.
  - `isCurrentOwner(owner: SessionOwner): boolean`
  - `bindRequestToOwner(owner: SessionOwner, signal?: AbortSignal): { config: { caloriaOwner: SessionOwner; signal: AbortSignal }; release: () => void }`. O `signal` aborta quando a sessão muda ou quando o `signal` do chamador aborta. Se o dono já não for o atual, volta um sinal já abortado. `release()` remove os listeners e precisa ser chamado no `finally` do chamador.
  - Augmentation: `declare module 'axios' { interface AxiosRequestConfig { caloriaOwner?: SessionOwner } }`

- [ ] **Passo 1: escrever os testes que falham** em `session-owner.test.ts`:
  - `isCurrentOwner` é falso depois de `clearToken()` e de `setToken` com outro usuário, e verdadeiro depois de `setToken` com o mesmo usuário (a geração não muda).
  - `bindRequestToOwner(captureSessionOwner()).config.signal.aborted` passa de `false` para `true` logo depois de `clearToken()`, de forma síncrona.
  - Um dono antigo recebe um sinal já abortado.
  - O sinal do chamador abortado aborta o combinado. Depois de `release()`, abortar o chamador não aborta o combinado.

  Em `api.refresh.test.ts`, usando um adapter de teste que registra as configs:
  - Uma requisição com `caloriaOwner` de A, com a sessão já em B: rejeita com `ERR_CANCELED` e o adapter não é chamado.
  - Uma config de retry com `_caloriaSessionGeneration` diferente da atual: rejeita com `ERR_CANCELED`, sem `Authorization`.
  - Uma requisição sem `caloriaOwner`: comportamento igual ao de hoje, com o token atual.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/shared/services/session-owner.test.ts src/shared/services/api.refresh.test.ts`. Esperado: FAIL, módulo inexistente e casos novos vermelhos.
- [ ] **Passo 3: implementar `session-owner.ts`.** Usar um `AbortController` por sessão, trocado num `useAuthStore.subscribe` quando `sessionGeneration` ou `user?.id` mudam (abortar o antigo e criar um novo). Para combinar, criar um controller novo com listeners `{ once: true }`. Não usar `AbortSignal.any`, que o Hermes não garante.
- [ ] **Passo 4: interceptor em `api.ts`.**
  - Se `config.caloriaOwner && !isCurrentOwner(config.caloriaOwner)`, lançar `new axios.CanceledError()`.
  - Se `_caloriaSessionGeneration !== undefined` e for diferente da atual, lançar `CanceledError`. Se não, gravar a geração atual.
  - Só então anexar o token.
  - Manter o registro assíncrono atual: não passar `{ synchronous: true }`, ver spec R1.
- [ ] **Passo 5: rodar e ver passar.** Mesmo comando do Passo 2. Esperado: PASS.
- [ ] **Passo 6: commit.**
  ```bash
  git add app/src/shared/services/session-owner.ts app/src/shared/services/session-owner.test.ts app/src/shared/services/api.ts app/src/shared/services/api.refresh.test.ts
  git commit -m "fix(app): requisição vinculada ao dono da sessão não troca de credencial (D03)"
  ```

### Task 2: scanner, coach e diário enviam requisições vinculadas (R1, aplicação)

**Arquivos:**
- Modificar: `app/src/shared/services/scanner.service.ts:61-104`
- Modificar: `app/src/shared/services/coach.service.ts:71-149`
- Modificar: `app/src/shared/services/food-log.service.ts:49-50`
- Modificar: `app/src/shared/services/operation-requests.ts:42-45`. Remover `requestSessionMatches` e trocar os usos por `isCurrentOwner`.
- Modificar: `app/src/shared/services/operation-requests.test.ts` (troca de import)
- Criar: `app/src/shared/services/session-isolation.test.ts`

**Interfaces:**
- Consome: `captureSessionOwner`, `isCurrentOwner` e `bindRequestToOwner` da Task 1.
- Produz: `foodLogService.addMeal(data: AddMealPayload, owner?: SessionOwner): Promise<Meal>`. Com `owner`, a requisição é vinculada.

- [ ] **Passo 1: escrever os testes que falham.** `session-isolation.test.ts` é uma cópia adaptada de `docs/qa/debug-2026-10-18/app-live-session-diagnostic.test.ts`, com imports por alias (`@features/...`, `@shared/...`) e os mesmos `beforeEach`/`afterEach`. Trazer os dois casos de D03:
  - `'troca de conta enfileirada não envia a foto de A com credencial de B'`: `expect(photos).toHaveLength(0)`. Remover a linha que exige `Bearer fixture-B`.
  - `'troca de conta enfileirada não envia a mensagem de A com credencial de B'`: `expect(delivered).toBe(false)` e `expect(posts).toHaveLength(0)`.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/shared/services/session-isolation.test.ts`. Esperado: FAIL, com 1 POST em cada caso.
- [ ] **Passo 3: implementar.**
  - `analyzePhoto` e `sendMessage` capturam o dono antes do `beginRequest`.
  - O POST principal usa `bindRequestToOwner(owner, signal)`: espalhar `config` nas opções do axios e chamar `release()` no `finally`.
  - O listener `cancelPending` continua no sinal **do chamador**, não no combinado. Assim, um logout não dispara `/cancel` com o token de B.
  - O POST de `/cancel` também usa um dono vinculado.
- [ ] **Passo 4: rodar e ver passar.** `cd app && npx jest src/shared/services`. Esperado: PASS, incluindo `scanner.service.test.ts`, `coach.service.test.ts` e `operation-requests.test.ts`.
- [ ] **Passo 5: commit.**
  ```bash
  git add app/src/shared/services/{scanner.service.ts,coach.service.ts,food-log.service.ts,operation-requests.ts,operation-requests.test.ts,session-isolation.test.ts}
  git commit -m "fix(app): scanner, coach e diário enviam requisição vinculada ao dono (D03)"
  ```

### Task 3: pendência só é aposentada depois da entrega (R3, D02)

**Arquivos:**
- Modificar: `app/src/shared/services/scanner.service.ts` (sucesso de `analyzePhoto`)
- Modificar: `app/src/shared/services/coach.service.ts` (sucesso de `sendMessage`)
- Modificar: `app/src/features/scanner/store.ts:49-58` (`analyze`)
- Modificar: `app/src/features/coach/store.ts`: `sendMessage` (cerca de `:222-237`) e `retryLastAction` (cerca de `:270`)
- Modificar os mocks de retorno: `features/scanner/store.test.ts`, `features/scanner/screens/AnalyzingScreen.test.tsx`, `features/scanner/screens/ScanResultScreen.test.tsx`, `features/coach/store.test.ts`, `features/coach/store.credits-session.test.ts`, `features/coach/hooks/useVoiceMessage.test.ts`, `features/coach/components/ChatInput*.test.tsx`, `shared/services/scanner.service.test.ts`, `shared/services/coach.service.test.ts`
- Teste: `app/src/shared/services/session-isolation.test.ts` (acrescentar casos)

**Interfaces:**
- Consome: `isCurrentOwner` (Task 1), `finishRequest` (já existe).
- Produz:
  - `scannerService.analyzePhoto(image, signal?): Promise<ScanResponse & { acknowledge: () => Promise<void> }>`
  - `coachService.sendMessage(content, conversationId, voice?): Promise<{ conversationId: string; message: CoachMessage; acknowledge: () => Promise<void> }>`
  - `analyzePhotoGuest` não muda.

- [ ] **Passo 1: escrever os testes que falham** em `session-isolation.test.ts`:
  - `'primeiro turno do coach entregue depois do logout continua recuperável para A'`: adapter com entrega controlada, `clearToken` + `setToken(B)` antes de entregar. Esperado: `pending === false`, `conversationId === null` e `pendingRequests(A.id)` com tamanho 1.
  - `'foto entregue depois do logout continua recuperável para A'`: `useScannerStore.getState().analyze(image)`, adapter com entrega controlada, logout e login B antes de entregar. Esperado: `items` igual a `[]` e `pendingRequests(A.id)` com tamanho 1. Este caso substitui o seam de "limpeza pausada" do diagnóstico, que deixa de existir porque não há mais limpeza antes da entrega.
  - `'A volta e reenvia a mesma foto: mesma chave, sem nova chave'`: depois do caso anterior, `clearToken` + `setToken(A)` e `analyze(image)` de novo. Esperado: o header `Idempotency-Key` igual ao da primeira tentativa, os itens aplicados e `pendingRequests(A.id)` com tamanho 0 depois do `acknowledge`.
  - `'voz abortada depois da resposta mantém a pendência'`: `sendMessage` com `voice` cujo `isValid()` passa a `false` antes da entrega. Esperado: `false` e 1 pendência.
  - `'retryLastAction atravessando logout não aplica nem aposenta'`: esperado `conversationId` inalterado e 1 pendência.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/shared/services/session-isolation.test.ts`. Esperado: FAIL, com 0 pendências.
- [ ] **Passo 3: serviços.** No sucesso:
  - Se `!isCurrentOwner(owner)`, lançar `CanceledError` **sem** `finishRequest`.
  - Se não, `notifyCreditChange()` e devolver o resultado com `acknowledge: () => finishRequest(request, owner.userId)`.
  - O ramo de rejeição definitiva não muda.
- [ ] **Passo 4: stores.**
  - `analyze` (só no caminho autenticado) e `sendMessage` chamam `void res.acknowledge()` **depois** do `set(...)` e só dentro do ramo em que o guard passou.
  - `retryLastAction` passa a capturar `useAuthStore.getState().sessionGeneration` e a exigir que ela e `dietSession` sejam as mesmas antes de aplicar e de dar `acknowledge`.
  - Nos mocks dos testes listados, acrescentar `acknowledge: jest.fn().mockResolvedValue(undefined)` aos retornos.
- [ ] **Passo 5: rodar e ver passar.** `cd app && npx jest src/features/scanner src/features/coach src/shared/services`. Esperado: PASS.
- [ ] **Passo 6: commit.**
  ```bash
  git add app/src/shared/services/{scanner.service.ts,coach.service.ts,session-isolation.test.ts,scanner.service.test.ts,coach.service.test.ts} app/src/features/scanner app/src/features/coach
  git commit -m "fix(app): resultado pago só é aposentado depois de entregue ao dono (D02)"
  ```

### Task 4: confirmação do scanner não atravessa sessão nem tentativa (R2, D01)

**Arquivos:**
- Modificar: `app/src/features/scanner/store.ts:104-150` (`confirm`)
- Modificar: `app/src/features/scanner/screens/ScanResultScreen.tsx:28-38` (`onConfirm`)
- Teste: `app/src/features/scanner/store.test.ts`, `app/src/features/scanner/screens/ScanResultScreen.test.tsx`, `app/src/shared/services/session-isolation.test.ts`

**Interfaces:**
- Consome: `captureSessionOwner` e `isCurrentOwner` (Task 1); `foodLogService.addMeal(data, owner)` (Task 2).
- Produz: `confirm()` rejeita com `Error('SCAN_CONFIRM_STALE')` quando o dono ou a tentativa mudaram.

- [ ] **Passo 1: escrever os testes que falham.**
  - Em `store.test.ts`, copiar o caso de `docs/qa/debug-2026-10-18/scanner-confirm-session.repro.test.ts` com as asserções de lá: diário igual a `[]`, itens iguais a `['new-scan']`, imagem `'new-account-image'`, e agora também `await expect(savingOldAccount).rejects.toThrow('SCAN_CONFIRM_STALE')`.
  - `'mesma conta, nova análise durante o salvamento: refeição entra no diário e o novo scan fica intacto'`: chamar `reset()` e depois `setState({ image: 'segunda', items: [...] })` antes da resposta. Esperado: diário com a refeição, scanner com o segundo scan, `showAlert` não chamado e rejeição `SCAN_CONFIRM_STALE`.
  - `'falha parcial depois da troca de conta não mostra alerta'`: um `addMeal` rejeitado e logout antes de resolver. Esperado: `showAlert` não chamado.
  - Em `ScanResultScreen.test.tsx`: `'SCAN_CONFIRM_STALE não chama goBack'`.
  - Em `session-isolation.test.ts`: o caso de `confirm` do diagnóstico ao vivo, com `addMeal` de A e o logout enfileirado, acrescentando que o POST `/food-log` não é despachado depois da troca.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/features/scanner src/shared/services/session-isolation.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementar `confirm`.**
  - Capturar `owner` e `attempt = analysisGeneration` no início.
  - Passar `owner` a cada `addMeal`.
  - Depois do `allSettled`, seguir esta ordem: (1) dono mudou: lançar `SCAN_CONFIRM_STALE` sem efeitos; (2) aplicar `useFoodLogStore.addMeal` dos salvos; (3) tentativa mudou: lançar `SCAN_CONFIRM_STALE` sem tocar no scanner nem alertar; (4) caminho atual.
- [ ] **Passo 4: implementar `onConfirm`.** No `catch`, se `e.message === 'SCAN_CONFIRM_STALE'`, só sair. Nos demais erros, o comportamento de hoje.
- [ ] **Passo 5: rodar e ver passar.** Mesmo comando do Passo 2. Esperado: PASS.
- [ ] **Passo 6: rodar a suíte inteira, conferir o fingerprint e commit.** `cd app && npx jest && npx tsc --noEmit`. Conferir o fingerprint das Restrições globais.
  ```bash
  git add app/src/features/scanner app/src/shared/services/session-isolation.test.ts
  git commit -m "fix(app): confirmação do scanner não grava na conta seguinte (D01)"
  ```
  Abrir o PR 1 (`fix/sessao-isolamento`) com a evidência: o comando dos diagnósticos `app-*-diagnostic` agora tem apenas D04 e o risco do 500 vermelhos.

### Task 5: lock entre abas para as pendências (R4, D04)

**Arquivos:**
- Criar: `app/src/shared/services/storage-lock.ts`
- Modificar: `app/src/shared/services/operation-requests.ts:30-40` (`serialized`)
- Criar: `app/src/shared/services/operation-requests.cross-runtime.test.ts`

**Interfaces:**
- Produz: `withStorageLock<T>(name: string, action: () => Promise<T>): Promise<T>`. Com `navigator.locks?.request`, roda `action` dentro de `navigator.locks.request(name, action)`. Sem esse recurso, roda `action()` direto.

- [ ] **Passo 1: escrever o teste que falha.** `operation-requests.cross-runtime.test.ts` é uma cópia do caso `'P2: two browser runtimes…'` de `app-operation-diagnostic.test.ts`, com `subscribe: () => () => {}` no mock de `useAuthStore` e um `globalThis.navigator.locks` de teste: um mutex FIFO por nome, compartilhado entre os dois `isolateModules`. Esperado: `pendingRequests('owner-A')` com tamanho 2. Acrescentar um caso **sem** `navigator.locks` em que uma única aba continua serializando foto e chat, com 2 pendências.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/shared/services/operation-requests.cross-runtime.test.ts`. Esperado: FAIL, com 1 em vez de 2.
- [ ] **Passo 3: implementar.** `serialized(owner, action)` passa a envolver a fila em memória em `withStorageLock(storageKey(owner), …)`, usando a mesma chave de storage como nome do lock.
- [ ] **Passo 4: rodar e ver passar.** `cd app && npx jest src/shared/services`. Esperado: PASS.
- [ ] **Passo 5: commit.**
  ```bash
  git add app/src/shared/services/{storage-lock.ts,operation-requests.ts,operation-requests.cross-runtime.test.ts}
  git commit -m "fix(app): pendências de crédito sob lock entre abas (D04)"
  ```

### Task 6: 500 ambíguo mantém a chave (R5)

**Arquivos:**
- Modificar: `app/src/shared/services/operation-requests.ts:135-158`
- Teste: `app/src/shared/services/operation-requests.test.ts`, `app/src/shared/services/operation-requests.cross-runtime.test.ts`

**Interfaces:**
- Produz: `export const FAILED_BEFORE_SETTLEMENT = ['VISION_ERROR', 'AI_ERROR', 'AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_TRUNCATED', 'TRANSCRIBE_FAILED'] as const`. O comentário aponta a origem de cada um: `backend/src/modules/scanner/scanner.service.ts:142`, `backend/src/modules/chat/chat.service.ts:148-153,459` e `backend/src/modules/chat/transcribe.service.ts:81`.

- [ ] **Passo 1: conferir a allowlist.** Ler os pontos acima e confirmar que cada código só é lançado dentro do `infer()` passado a `runCreditOperation`, que marca `failed` e libera a reserva (`backend/src/modules/credits/credits.service.ts:192-217`). Retirar da lista qualquer código lançado fora do `infer()`.
- [ ] **Passo 2: escrever os testes que falham.**
  - Em `operation-requests.test.ts`, tabela de `isDefinitiveRejection`:
    - 500 `INTERNAL_SERVER_ERROR` dá `false`.
    - 502 sem código dá `false`.
    - 503 `CREDITS_UNAVAILABLE` dá `false`.
    - 500 com código desconhecido dá `false`.
    - 502 `VISION_ERROR`, 504 `AI_TIMEOUT` e 502 `TRANSCRIBE_FAILED` dão `true`.
    - 409 `OPERATION_FAILED` dá `true`.
    - 429 `TOO_MANY_REQUESTS` dá `false`.
    - 422 dá `true`.
  - Em `cross-runtime.test.ts`, copiar o caso do 500 do diagnóstico (`keys.size === 1`) e acrescentar `'500, 500 e depois 409 OPERATION_FAILED: mesma chave até o 409, chave nova depois'`.
- [ ] **Passo 3: rodar e ver falhar:** `cd app && npx jest src/shared/services/operation-requests`. Esperado: FAIL nos 5xx ambíguos.
- [ ] **Passo 4: implementar.** Um 5xx é definitivo só se o código estiver em `FAILED_BEFORE_SETTLEMENT`. As regras de 409, 429 e 4xx não mudam. `AMBIGUOUS_SERVER_ERRORS` passa a valer só para 429.
- [ ] **Passo 5: rodar a suíte, conferir o fingerprint e commit.** `cd app && npx jest && npx tsc --noEmit`.
  ```bash
  git add app/src/shared/services/operation-requests.ts app/src/shared/services/operation-requests.test.ts app/src/shared/services/operation-requests.cross-runtime.test.ts
  git commit -m "fix(app): 500 ambíguo preserva a chave da operação"
  ```
  Abrir o PR 2 (`fix/pendencias-recuperacao`). O comando dos diagnósticos `app-*-diagnostic` precisa sair com 0 falhas, exceto o caso de D04, que não tem `navigator.locks` no harness original. Registrar isso no PR.

### Task 7: exclusão de conta sem colisão de chave (R6, D05)

**Arquivos:**
- Criar: `backend/supabase/migrations/<timestamp>_credits_deletion_key_fix.sql`, gerado pelo CLI
- Modificar: `backend/src/modules/credits/credits.integration.test.ts:36-44`, para carregar a migration nova depois da de 16/10 e acrescentar casos

**Interfaces:**
- Produz: a função `credit_private.credit_clear_deleted_result()` com `idempotency_key = 'deleted:' || id::text`.

- [ ] **Passo 1: gerar o arquivo.** De `backend/`: `supabase migration new credits_deletion_key_fix`. Se o CLI exigir `supabase init` ou `config.toml`, não inicializar. Criar o arquivo com `date -u +%Y%m%d%H%M%S`, que é o formato do CLI, e registrar isso no commit.
- [ ] **Passo 2: escrever os testes que falham** em `credits.integration.test.ts`, com o mesmo papel `credits_test_auth_admin` do caso de exclusão que já existe:
  - `'exclusão com chave igual ao id de outra operação não colide'`: operação A com chave `'0000000000000000'`; operação B com chave igual a `A.receipt.operation_id`; dentro da transação do `DELETE`, `SET LOCAL enable_seqscan=off` e `SET LOCAL enable_bitmapscan=off`. Repetir 3 vezes, recriando os dados. Esperado: usuário removido e as duas operações com `idempotency_key LIKE 'deleted:%'`.
  - `'exclusão de conta sem operações e com operação failed'`: esperado sem erro.
- [ ] **Passo 3: rodar e ver falhar:** `cd backend && TEST_DATABASE_URL=… npx vitest run src/modules/credits/credits.integration.test.ts`. Esperado: FAIL com `23505` (a migration nova ainda está vazia).
- [ ] **Passo 4: escrever a migration.** `CREATE OR REPLACE FUNCTION` com corpo, `SECURITY DEFINER` e `SET search_path=pg_catalog` iguais aos de `20261016012212_credits_and_invites.sql:73-78`, mudando só a expressão da chave. Repetir o `REVOKE ALL ON FUNCTION ... FROM PUBLIC`.
- [ ] **Passo 5: rodar e ver passar.** Mesmo comando do Passo 3. Esperado: PASS.
- [ ] **Passo 6: commit.**
  ```bash
  git add backend/supabase/migrations/*_credits_deletion_key_fix.sql backend/src/modules/credits/credits.integration.test.ts
  git commit -m "fix(db): exclusão de conta sem colisão de idempotency_key (D05)"
  ```

### Task 8: prazo validado depois do lock (R7, D06)

**Arquivos:**
- Modificar: `backend/src/modules/credits/credits.service.ts:170-175`
- Modificar: `backend/src/modules/credit-invites/credit-invites.service.ts:52-64`
- Teste: `backend/src/modules/credits/credits.integration.test.ts`

- [ ] **Passo 1: escrever os testes que falham.** Copiar a mecânica de `docs/qa/debug-2026-10-18/backend-credits-repro.mts`: segunda conexão segurando o lock por 350 ms e prazo de 250 ms ajustado por `UPDATE` direto.
  - `'liquidação que espera o lock além do prazo expira sem débito'`: esperado `OPERATION_EXPIRED`, `state='failed'`, `reserved_units=0`, saldo sem mudança e nenhuma linha `debit` no ledger.
  - `'resgate que espera o lock além do prazo não concede'`: esperado `INVITE_UNAVAILABLE`, convite `active`, nenhum `credit_welcome_claims` e saldo sem mudança.
  - Controle: `'liquidação dentro do prazo, mesmo esperando o lock, debita normalmente'`.
- [ ] **Passo 2: rodar e ver falhar:** `cd backend && TEST_DATABASE_URL=… npx vitest run src/modules/credits/credits.integration.test.ts`. Esperado: FAIL nos dois cenários de prazo.
- [ ] **Passo 3: liquidação.**
  - O `SELECT ... FOR UPDATE` da operação filtra só por `id`, `fence` e `state='running'`.
  - Em seguida, um comando separado: `SELECT lease_expires_at < clock_timestamp() AS expired FROM credit_operations WHERE id=${id}`.
  - Se não houver linha ou se `expired`, lançar o `OPERATION_EXPIRED` que já existe.
- [ ] **Passo 4: resgate.**
  - O `SELECT ... FOR UPDATE` do convite deixa de calcular `expired`.
  - Depois dele, `SELECT expires_at <= clock_timestamp() AS expired FROM credit_invites WHERE id=${invite.id}`.
  - O ramo de replay (`prior.invite_id === invite.id`) continua antes da checagem de prazo.
- [ ] **Passo 5: rodar e ver passar.** A suíte de integração completa e `cd backend && npm test && npx tsc --noEmit`. Rodar também `docs/qa/debug-2026-10-18/backend-credits-repro.mts` com o comando de `backend-credits-findings.md`, aplicando a migration nova se o harness carregar só a de 16/10. Esperado: exit 0.
- [ ] **Passo 6: commit e PR 3** (`fix/creditos-backend`). No PR, registrar que a migration nova é aplicada no Supabase **junto** com a de 16/10, antes de ligar a cobrança.
  ```bash
  git add backend/src/modules/credits/credits.service.ts backend/src/modules/credit-invites/credit-invites.service.ts backend/src/modules/credits/credits.integration.test.ts
  git commit -m "fix(credits): prazo de reserva e convite validado depois do lock (D06)"
  ```

### Task 9: saldo desconhecido não vira zero (R8, D07)

**Arquivos:**
- Modificar: `app/src/features/credits/components/CreditBalance.tsx:9-27`
- Teste: `app/src/features/credits/components/CreditBalance.test.tsx`

- [ ] **Passo 1: escrever os testes que falham.** Copiar os quatro casos de `credit-balance-loading.repro.test.tsx`. Acrescentar `'recurso ativo, carteira null e loading: mostra Consultando saldo…'`.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/features/credits`. Esperado: FAIL no retry.
- [ ] **Passo 3: implementar.** Ler `loading` do store. Texto: se `error`, `'Saldo indisponível · consultar'`. Se não, se `wallet`, o número de hoje. Se não, `'Consultando saldo…'`. O retorno `null` com `!featureVisible` não muda.
- [ ] **Passo 4: rodar e ver passar.** Mesmo comando do Passo 2. Esperado: PASS.
- [ ] **Passo 5: commit.**
  ```bash
  git add app/src/features/credits/components/CreditBalance.tsx app/src/features/credits/components/CreditBalance.test.tsx
  git commit -m "fix(app): saldo em consulta não aparece como zero (D07)"
  ```

### Task 10: convite indisponível não oferece resgate (R9, D08)

**Arquivos:**
- Modificar: `app/src/features/invites/screens/InviteScreen.tsx:84-101` (`catch` do `claim`) e `:143` (botão de claim)
- Teste: `app/src/features/invites/screens/InviteScreen.test.tsx`

- [ ] **Passo 1: escrever os testes que falham.** Copiar `'terminal unavailability must not leave an enabled claim action…'` do repro. Acrescentar:
  - `'WELCOME_ALREADY_CLAIMED desabilita o claim e mantém Trocar de conta'`.
  - `'falha de rede mantém o claim habilitado'`.
- [ ] **Passo 2: rodar e ver falhar:** `cd app && npx jest src/features/invites`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - Com `INVITE_UNAVAILABLE`, chamar `setPreview(null)` junto com a mensagem.
  - Com `WELCOME_ALREADY_*`, acionar um estado `claimBlocked` que passa `disabled` ao botão de claim. Esse estado é zerado no `useEffect` que já zera `done`/`busy` quando o `scope` muda (troca de conta ou de token).
- [ ] **Passo 4: rodar e ver passar.** `cd app && npx jest src/features/invites src/features/credits && npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5: suíte completa, fingerprint, commit e PR 4** (`fix/creditos-ui`).
  ```bash
  git add app/src/features/invites/screens/InviteScreen.tsx app/src/features/invites/screens/InviteScreen.test.tsx
  git commit -m "fix(app): convite indisponível não mantém o botão de resgate (D08)"
  ```

### Task 11: fechamento

- [ ] **Passo 1: rodar todos os diagnósticos** com os três comandos de `RELATORIO.md`, seção "Reproduzir". Esperado: tudo verde, exceto o que estiver registrado nos PRs (D04 sem `navigator.locks` no harness original, e casos do harness de D02 cujo seam deixou de existir). Para cada exceção, apontar a regressão equivalente nas roots normais.
- [ ] **Passo 2: acrescentar ao fim de `docs/qa/debug-2026-10-18/RELATORIO.md`** uma seção "Correções" com PR/commit por achado. Esse é o único ponto em que a pasta de evidência é editada.
- [ ] **Passo 3: atualizar o runbook** `docs/qa/ios-ux-2026-10-15/creditos-runbook.md`. A ordem de ativação passa a ser: aplicar as duas migrations, publicar OTA com os PRs 1, 2 e 4, publicar o AAB 30 no Play e só então ligar a flag.
