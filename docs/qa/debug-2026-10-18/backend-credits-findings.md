# Diagnóstico backend — 18/10/2026

Código inspecionado: `f5ca5bf`. Nenhum código de produção alterado. Banco descartável PostgreSQL 17.11 local; sem OpenRouter, Supabase remoto ou dados reais. Flags ativadas somente no processo do harness. O estado das flags e as permissões do banco de produção não foram consultados.

## P2 — exclusão de conta pode falhar por colisão entre chaves válidas

Fonte: `backend/supabase/migrations/20261016012212_credits_and_invites.sql:75` (trigger `credit_clear_deleted_result`). A exclusão reescreve `idempotency_key=id::text` antes de remover o vínculo com o usuário. Um ID de operação também é uma chave idempotente válida. Se outra operação já usa esse ID como chave, a atualização intermediária viola `UNIQUE(user_id,idempotency_key)` e aborta a exclusão inteira.

Reprodução: concluir operação A com chave `0000000000000000`; concluir B usando como chave `A.receipt.operation_id`; excluir a conta. Resultado observado: SQLSTATE `23505`, constraint `credit_operations_user_id_idempotency_key_key`, usuário continua no banco. O erro depende da ordem de atualização. O harness fixa um plano de index scan com `SET LOCAL enable_seqscan=off` e `enable_bitmapscan=off`; não altera o código do trigger nem os dados de produção. Reproduziu 3/3 vezes com esse plano; também ocorreu em execuções sem fixar o plano, mas não em todas. Não se afirma que toda exclusão falha.

## P2 — validação temporal usa relógio anterior à espera por lock

Fontes: `backend/src/modules/credits/credits.service.ts:174` e `backend/src/modules/credit-invites/credit-invites.service.ts:54`. `now()` representa o início da transação. Aguardar um row lock não atualiza esse valor. Assim, uma transação iniciada enquanto o prazo era válido pode aprovar a operação depois de ele expirar.

Dois cenários reproduzidos, cada um 3/3 vezes:

- **Liquidação:** reserva recebe prazo de 250 ms; transação de liquidação espera pelo wallet lock por 350 ms; ao retomar, conclui e debita 15 unidades. Observado `state=succeeded`, `expired=true`, `charged_units=15`. A verificação deveria rejeitar a liquidação já fora do prazo, seguindo o contrato de deadline.
- **Convite:** convite recebe prazo de 250 ms; resgate inicia antes da expiração e espera pelo lock do convite por 350 ms; ao retomar, concede 75 unidades. Observado `expired=true`, `status=used`, `granted=true`. Esperado `INVITE_UNAVAILABLE` sem concessão.

Os prazos curtos são apenas aceleração do mesmo caminho; a regra de comparação e os locks são os serviços reais. Isso não demonstra ocorrência no tráfego de produção nem permite afirmar que o problema ocorre sem contenção de locks.

## Reprodução e controles

O harness **recria os schemas public/auth/credit_private**. Usar somente banco descartável local com nome contendo `credits_test`. Exige dependências do backend e PostgreSQL local. Exemplo após iniciar uma instância descartável na porta 55439 e criar `credits_test`:

```sh
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55439/credits_test \
  node backend/node_modules/tsx/dist/cli.mjs \
  docs/qa/debug-2026-10-18/backend-credits-repro.mts
```

Resultado atual esperado do diagnóstico: exit **1**, com três cenários `FAIL`. Saída preservada em `backend-credits-output.txt`. Os assertions representam o comportamento correto, permitindo que o mesmo comando fique verde quando as causas forem corrigidas.

Antes dos reprodutores novos, os testes existentes passaram: **39 testes**, incluindo os 17 testes de PostgreSQL de créditos, sete testes HTTP, seis de política, oito do guard de admin e um de permissões de perfil. Isso confirma que os cenários novos não estavam cobertos pelo harness existente; não prova ausência de outros erros.

Nenhuma correção foi aplicada, conforme o pedido de diagnóstico e relatório.
