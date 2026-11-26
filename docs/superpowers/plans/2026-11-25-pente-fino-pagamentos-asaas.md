# Pente fino — pagamentos Asaas: plano

**Spec:** [2026-11-25-pente-fino-pagamentos-asaas.md](../specs/2026-11-25-pente-fino-pagamentos-asaas.md)
**Branch:** `fix/pente-fino-1` (worktree `../calorIA-pente-fino`). Só commits locais, sem push.

## Restrições

- TDD: o teste falha primeiro, depois vem a correção.
- Testes de Postgres só num banco local descartável, com nome contendo `credits_test` (guarda do harness
  `subscriptions.integration.test.ts`). Subir com `initdb`/`pg_ctl` num diretório temporário e numa
  porta livre, e derrubar no fim.
- Não editar migrations antigas. Criar a `028_*` e acrescentá-la a `SUBSCRIPTION_MIGRATIONS`.
- Staging só de arquivos explícitos.

## Tasks

### Task 1 — R5 (P6): ignorar cobrança avulsa com a recarga desligada
- [ ] Teste em `asaas-webhook` (unit/routes test que já mocka `env`): evento `PAYMENT_CONFIRMED` sem
      `subscription`, com `CREDIT_PURCHASES_ENABLED=false`, devolve `'ignored'`.
- [ ] Guard em `handleAsaasEvent` antes de `handlePurchaseEvent`.

### Task 2 — R4 (P5): evento genérico não grava status terminal
- [ ] Teste de integração: CONFIRMED → UPDATED(status REFUNDED) → REFUNDED. Saldo e `paid_until`
      revertidos.
- [ ] No ramo genérico, filtrar `p.status`. Se for terminal (pago ou estornado), gravar `PENDING` só para
      linha nova e manter o status existente nas outras.

### Task 3 — R3 (P3, P4): `past_due` só para quem pagou
- [ ] Testes de integração: OVERDUE atrasado depois do CONFIRMED mantém `active`; OVERDUE numa
      assinatura `pending` mantém `pending`.
- [ ] Teste unit de `checkout`: open `{status:'past_due', entitled:false}` e sem pagamento confirmado
      segue o caminho de `pending`, sem 409.
- [ ] Ajustar `upsertPaymentStatus` para devolver o status final e o UPDATE de `past_due`.
- [ ] Ajustar o guard do `checkout`, consultando `subscription_payments` por CONFIRMED/RECEIVED.

### Task 4 — R1 (P1): checkout duplo
- [ ] Teste de integração com fake do Asaas: A fica parado em `createSubscription`, B roda e A é liberado.
      Espera exatamente uma chamada a `createSubscription` e uma assinatura aberta. B recebe 409.
- [ ] `pending` sem id há menos de 10 min lança 409. O `UPDATE` exige `status='pending'` e, se não
      atualizar nada, cancela a assinatura remota e lança 409.

### Task 5 — R2 (P2): índice da recarga
- [ ] Migration `028_credit_purchases_inflight_index.sql`, acrescentada ao harness.
- [ ] Teste de integração: compra presa com id nulo + OVERDUE fica `expired` com o id gravado, e o
      checkout novo passa.
- [ ] `handlePurchaseEvent` grava `asaas_payment_id` em todo evento casado por `externalReference`.

### Task 6 — fechamento
- [ ] `npm run typecheck`, `npm test` e a suíte de integração com `TEST_DATABASE_URL`.
- [ ] Atualizar o ledger e fazer um commit por task, ou um único commit se ficar pequeno.
