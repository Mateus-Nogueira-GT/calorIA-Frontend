# Correções do debug de 18/10 — sessão, recuperação e créditos

Data: 18/10/2026. Base inspecionada: main `f5ca5bf`.
Origem: [relatório de debug](../../qa/debug-2026-10-18/RELATORIO.md) (D01–D08 + risco do 500 ambíguo).
Plano: [2026-10-18-correcoes-debug-sessao-creditos.md](../plans/2026-10-18-correcoes-debug-sessao-creditos.md).
Status: **proposta**. Nada implementado.

## 1. Objetivo

Corrigir os oito achados reproduzidos e o risco do 500 ambíguo antes de ligar `CREDITS_ENFORCEMENT_ENABLED` em produção e antes de aplicar a migration de créditos no Supabase remoto. Cada correção precisa deixar verde o teste de diagnóstico correspondente, que depois passa a fazer parte das suítes normais.

Fora de escopo: a triagem do `npm audit`, que fica para uma spec própria; testes no iPhone 13/iPad e VoiceOver; mudanças de preço ou de política; e qualquer mudança nativa. Todas as correções são JS ou SQL, então o fingerprint de `app/android` e `app/ios` não muda e as correções do app saem por OTA.

## 2. Princípio comum

Hoje, a maioria dos guards de sessão roda **depois** do efeito: a requisição já saiu, a chave já foi apagada, o store já foi alterado. A regra nova é:

> Toda operação assíncrona do usuário captura o **dono** (`userId` + `sessionGeneration`) no início, carrega esse dono até o ponto em que produz um efeito (despacho HTTP, gravação em store, limpeza de pendência) e **não produz o efeito** se o dono mudou.

O dono vira um tipo explícito, `SessionOwner`, num módulo próprio (`app/src/shared/services/session-owner.ts`). Ele é usado nos fluxos corrigidos aqui e substitui `requestSessionMatches`. Os guards locais de outras telas (Admin, Créditos, Perfil) continuam como estão.

## 3. Requisitos

### R1 — D03: requisição não troca de dono no despacho (P1)

Uma requisição **vinculada a um dono** leva duas proteções:

- **Checagem no interceptor:** a config leva `caloriaOwner`. Se o dono não for mais o atual, o interceptor lança `CanceledError` antes de anexar `Authorization`. O axios 1.20 roda os interceptors de forma assíncrona e em ordem reversa de registro (`legacyInterceptorReqResOrdering: true`), então o interceptor de auth roda por último e lê a sessão o mais tarde possível.
- **Sinal de sessão:** a config leva um `signal` que aborta assim que `sessionGeneration` ou `user.id` mudam (`useAuthStore.subscribe`). Se houver sinal do chamador (voz, scanner), os dois são combinados. Isso cobre a troca de conta que acontece **depois** do interceptor e antes do transporte, porque o `dispatchRequest` do axios checa `config.signal.aborted` antes de chamar o adapter.

Mais duas regras:

- Se `_caloriaSessionGeneration` já existir na config (retry depois do refresh) e for diferente da geração atual, a requisição é cancelada. O interceptor não sobrescreve mais a geração em silêncio.
- Scanner, coach e o `addMeal` disparado pelo `confirm()` do scanner usam requisições vinculadas. As outras chamadas do app não mudam.

Descartado: o interceptor síncrono (`{ synchronous: true }`). Ele faz o axios chamar o adapter no mesmo tick, mas um logout agendado logo depois ainda deixaria a requisição já montada com o token de A sair. O sinal de sessão cobre esse caso, e o interceptor síncrono não.

**Aceite:** os testes de D03 em `app-live-session-diagnostic.test.ts` (scanner e coach de texto) registram **0** POSTs no adapter.

### R2 — D01: confirmação do scanner não atravessa a sessão (P1)

- `confirm()` captura o dono e a tentativa do scanner (`analysisGeneration`) antes de salvar.
- Depois do `Promise.allSettled`:
  - **Dono mudou:** nenhuma mutação em store, nenhum alerta. Lança `Error('SCAN_CONFIRM_STALE')`.
  - **Mesmo dono, mas a tentativa mudou** (nova análise ou reset): as refeições salvas entram no diário, porque são da própria conta. Itens e imagem do scanner não são tocados, não há alerta, e lança `SCAN_CONFIRM_STALE`.
  - **Tudo atual:** comportamento de hoje, incluindo a remoção incremental dos itens salvos e o `SCAN_CONFIRM_PARTIAL`.
- `ScanResultScreen` trata `SCAN_CONFIRM_STALE` em silêncio: não chama `goBack`, porque a tela pertence a outra sessão ou tentativa.

**Aceite:** `scanner-confirm-session.repro.test.ts` fica verde: diário de B `[]`, scanner de B intacto.

### R3 — D02: resultado concluído só é aposentado quando entregue (P1)

- `scannerService.analyzePhoto` e `coachService.sendMessage` **deixam de chamar `finishRequest` no sucesso**. O resultado volta com `acknowledge(): Promise<void>`, que faz o `finishRequest`.
- Se o dono mudou quando a resposta chega, o serviço lança `CanceledError` **sem** encerrar a pendência.
- O store chama `acknowledge()` só depois de aplicar o resultado com o guard de sessão ainda válido. Se ele descartar o resultado (sessão trocada, aborto, requisição superada), a chave continua em `pendingRequests(userId)` e aparece em **Créditos → Solicitações pendentes** quando a conta A voltar.
- O coach tem dois pontos de envio: `sendMessage` e `retryLastAction`. O `retryLastAction` hoje só confere `dietSession` e passa a conferir também `sessionGeneration`.
- Uma rejeição definitiva continua chamando `finishRequest` dentro do serviço.
- As chaves que já ficaram órfãs antes desta correção não são migradas. Os metadados delas já foram apagados do aparelho, e o resultado continua no servidor e no ledger. Isso fica registrado como limite.

**Aceite:** os dois testes de D02 (primeiro turno do coach e scanner com limpeza pausada) terminam com **1** chave pendente para A, e recuperar pelo `PendingOperations` devolve o resultado.

### R4 — D04: pendências não se sobrescrevem entre abas (P2)

- O read/modify/write de `caloria:pending-operations:<userId>` roda dentro de um lock entre runtimes: Web Locks API (`navigator.locks.request`) com o nome da chave de storage.
- Sem `navigator.locks` (app nativo, que roda num processo só, e navegadores antigos), vale apenas a fila em memória de hoje. O risco que sobra fica limitado a navegadores sem Web Locks (Safari < 15.4) e é documentado.
- O formato persistido não muda, então não há migração de storage.

**Aceite:** o cenário de duas abas de `app-operation-diagnostic.test.ts`, com um `navigator.locks` de teste compartilhado, termina com **2** pendências.

### R5 — 500 ambíguo mantém a chave (risco financeiro)

- `isDefinitiveRejection` só trata um 5xx como definitivo quando o código está numa allowlist de falhas que o backend lança **dentro** do `infer()`. Nesse caso o `runCreditOperation` já marcou a operação como `failed` e liberou a reserva:
  `VISION_ERROR`, `AI_ERROR`, `AI_UNAVAILABLE`, `AI_TIMEOUT`, `AI_TRUNCATED`, `TRANSCRIBE_FAILED` e `HISTORY_WRITE_FAILED`. Este último é lançado por `persistHistory` dentro da transação de liquidação, então o rollback desfaz o débito antes do commit.
- Qualquer outro 5xx mantém a chave, inclusive `INTERNAL_SERVER_ERROR`, códigos desconhecidos e 5xx sem código. O retry com a mesma chave recebe o replay, se a operação teve sucesso, ou `409 OPERATION_FAILED`, que já é definitivo e libera uma chave nova no toque seguinte.
- As regras de 409 e 429 não mudam.
- A allowlist vira uma constante exportada com comentário apontando a origem de cada código no backend.

**Aceite:** o teste de 500 ambíguo de `app-operation-diagnostic.test.ts` registra **uma** chave nos dois POSTs.

### R6 — D05: exclusão de conta sem colisão de chave (P2)

- Nova migration, gerada pelo CLI do Supabase, com `CREATE OR REPLACE FUNCTION credit_private.credit_clear_deleted_result()` igual à atual, exceto por `idempotency_key = 'deleted:' || id::text`. O `:` não passa na validação de chave (`^[A-Za-z0-9_-]{16,128}$`), então nenhuma chave reescrita colide com uma chave viva. Cada `id` é único, então duas reescritas também não colidem entre si.
- `SECURITY DEFINER`, `search_path=pg_catalog` e o `REVOKE ... FROM PUBLIC` continuam iguais.
- A migration de 16/10 não é editada. Ela pode já ter sido aplicada em algum ambiente.

**Aceite:** com o plano de index scan forçado, o cenário de `backend-credits-repro.mts` exclui o usuário 3/3 vezes, e as duas operações ficam com `idempotency_key LIKE 'deleted:%'`.

### R7 — D06: prazo validado depois do lock (P2)

- **Liquidação** (`runCreditOperation`): o `SELECT ... FOR UPDATE` da operação deixa de filtrar por prazo. Depois dos locks de carteira e operação, um comando separado compara `lease_expires_at` com `clock_timestamp()`. Se o prazo venceu, retorna `OPERATION_EXPIRED` e cai no caminho de liberação que já existe.
- **Resgate de convite** (`redeemInvite`): o `FOR UPDATE` deixa de calcular `expired`. Um comando separado, depois do lock, calcula `expires_at <= clock_timestamp()`.
- Não usar `clock_timestamp()` dentro do mesmo `SELECT ... FOR UPDATE`: a reavaliação de linha travada (EvalPlanQual) não deixa explícita a ordem entre lock e leitura do relógio. Este é o alerta do relatório.
- `previewInvite` e `reconcileCreditOperations` continuam com `now()`. Eles não esperam lock antes de decidir, e o efeito do `now()` neles é conservador.

**Aceite:** os dois cenários de D06 de `backend-credits-repro.mts` (prazo de 250 ms, lock de 350 ms) terminam com `OPERATION_EXPIRED` sem débito e `INVITE_UNAVAILABLE` sem concessão.

### R8 — D07: saldo desconhecido não vira zero (P2)

- `CreditBalance` mostra o número só quando `wallet != null`. Com o recurso visível e sem carteira, mostra `Consultando saldo…` durante `loading` e `Saldo indisponível · consultar` quando há `error`.
- Continua sem renderizar nada quando `featureVisible` é falso.

**Aceite:** `credit-balance-loading.repro.test.tsx` fica verde nos quatro casos.

### R9 — D08: convite indisponível não oferece resgate (P2)

- Um `410 INVITE_UNAVAILABLE` no `/redeem` limpa a prévia (`setPreview(null)`). A tela mostra só o erro e o botão **Conferir convite**, que refaz a prévia.
- `WELCOME_ALREADY_*` mantém a prévia e o botão **Trocar de conta**, mas desabilita **Confirmar e receber créditos** para essa conta. O backend nega de novo, e o caminho útil é trocar de conta.
- As demais falhas (rede, 5xx) mantêm o claim habilitado para retry.

**Aceite:** `invite-terminal-action.repro.test.tsx` fica verde, inclusive os controles que já passam hoje. O caso `WELCOME_ALREADY_CLAIMED` continua mostrando a mensagem de "outra conta elegível".

## 4. Testes de diagnóstico viram regressão

Os arquivos de `docs/qa/debug-2026-10-18/` ficam lá como evidência. Cada tarefa leva o caso dela para o arquivo de teste vizinho do código corrigido, dentro das roots normais (`app/src/**`, `backend/src/**`), com as mesmas asserções. Os testes de PostgreSQL entram em `credits.integration.test.ts`, que já é opt-in via `TEST_DATABASE_URL`.

## 5. Ordem e entrega

1. **PR 1, app — isolamento de sessão:** R1, R2, R3.
2. **PR 2, app — recuperação:** R4, R5.
3. **PR 3, backend:** R6, R7. A migration nova é aplicada no Supabase **junto** com a de 16/10, antes de ligar a cobrança.
4. **PR 4, app — UI:** R8, R9.

Cada PR é revisável sozinho. Os PRs de app saem por OTA. O fingerprint é conferido antes do merge, porque nada nativo deve mudar.

## 6. Limites e riscos

- A janela de D03 foi reproduzida com agendamento controlado, e não há medição de frequência em aparelho. Uma requisição que já chegou ao transporte antes do logout sai com o token do próprio dono. Isso é correto, e a resposta é descartada pelos guards.
- R4 não protege navegadores sem Web Locks.
- R5 troca um risco de cobrança dupla por um segundo toque no caso raro de 500 ambíguo seguido de `OPERATION_FAILED`.
- As pendências órfãs de antes do R3 não voltam.
- Os testes de PostgreSQL rodam em banco descartável local. Grants e RLS do Supabase remoto não são validados aqui.
