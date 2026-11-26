# Pente fino — pagamentos Asaas (assinatura e recarga)

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-1`.
Origem: auditoria do loop de pente fino ([ledger](../../qa/pente-fino-ledger.md)). Cinco achados foram
reproduzidos em PostgreSQL local descartável e os outros foram confirmados lendo o código.
Plano: [2026-11-25-pente-fino-pagamentos-asaas.md](../plans/2026-11-25-pente-fino-pagamentos-asaas.md).

## Objetivo

Fechar os furos de estado da assinatura e da recarga antes de ligar `SUBSCRIPTIONS_ENABLED` e
`CREDIT_PURCHASES_ENABLED` em produção. Ninguém é cobrado em dobro hoje: as duas flags estão
desligadas por padrão e não foi verificado o estado delas em produção.

Fora de escopo:
- P7, a reconciliação quando o Asaas cria a cobrança mas a chamada estoura o tempo. Ela pede um estado
  "desconhecido" e uma consulta por `externalReference`, e fica registrada como suspeita.
- P8, a combinação de flags que mostra saldo zero. Mexe na regra de visibilidade dos créditos no app e
  é decisão de produto.

## Requisitos

### R1 — P1: dois toques no checkout não criam duas assinaturas no Asaas (alta)

`subscriptions.service.ts` `checkout`. Uma linha `pending` sem `asaas_subscription_id` é um checkout em
andamento e não pode ser cancelada por outro checkout. Nesse caso o checkout lança
`409 CHECKOUT_IN_PROGRESS`.

Uma linha `pending` sem id há mais de 10 minutos é considerada abandonada, porque o processo caiu no
meio, e pode ser cancelada como hoje.

O `UPDATE` que grava `asaas_subscription_id` passa a exigir `status = 'pending'`. Se não atualizar
nenhuma linha, porque a linha foi cancelada nesse meio-tempo, a assinatura recém-criada no Asaas é
cancelada (`asaas.deleteSubscription` ou o equivalente que o client já tem) e o checkout lança
`409 CHECKOUT_IN_PROGRESS`.

**Aceite:** no teste com Postgres, o checkout A fica parado em `createSubscription`, o checkout B roda
inteiro e A é liberado. Resultado: `createSubscription` chamado uma única vez e uma única assinatura
aberta.

### R2 — P2: recarga sem id do Asaas não bloqueia o pacote para sempre (média)

Uma migration nova (`028_credit_purchases_inflight_index.sql`) recria o índice parcial de "compra em
andamento" com `AND status = 'pending'`. O webhook da recarga, ao achar a compra por
`externalReference`, grava `asaas_payment_id` em qualquer evento, não só no pago.

**Aceite:** uma compra com id nulo que recebe `PAYMENT_OVERDUE` fica `expired` com o id gravado, e um
checkout novo do mesmo pacote passa.

### R3 — P3 e P4: `past_due` só para quem já pagou (baixa)

- O `PAYMENT_OVERDUE` só move a assinatura para `past_due` se o status gravado do pagamento ficou
  `OVERDUE` (`RETURNING status` no upsert) e se `status = 'active'`. Uma assinatura `pending` que
  nunca foi paga continua `pending`.
- O checkout trata uma assinatura `past_due` que nunca teve pagamento confirmado e não tem direito
  (`entitled = false`) como `pending`. Isso cobre linhas que já ficaram `past_due` antes da correção.

**Aceite:** um OVERDUE atrasado depois de um CONFIRMED mantém a assinatura `active`. Um OVERDUE numa
assinatura nunca paga mantém `pending`. Um checkout novo depois de uma fatura abandonada não devolve
`ALREADY_SUBSCRIBED`.

### R4 — P5: evento genérico não grava status de estorno nem de pago (baixa)

`PAYMENT_CREATED`, `PAYMENT_UPDATED` e `PAYMENT_RESTORED` não podem gravar status de
`REVERSED_STATUS`, `CONFIRMED` ou `RECEIVED`. Nesses casos mantêm o status anterior, ou `PENDING`
quando a linha é nova. Só os handlers dedicados (`markPaid` e `markReversed`) gravam esses status.

**Aceite:** a sequência CONFIRMED, UPDATED (com status REFUNDED) e REFUNDED termina com o estorno
aplicado: saldo de volta e direito encerrado.

### R5 — P6: com a recarga desligada, cobrança avulsa é ignorada (baixa)

Com `!env.CREDIT_PURCHASES_ENABLED`, o evento de pagamento sem assinatura devolve `'ignored'` sem
consultar `credit_purchases`. Assim, a migration 027 ausente não derruba a fila do Asaas.

**Aceite:** teste unitário em que o evento com a flag desligada devolve `'ignored'` sem query em
`credit_purchases`.

## Limites

- A migration 028 não é aplicada no Supabase remoto. Ela vai junto com a 027, antes de ligar a recarga.
- Nenhuma chamada real ao Asaas. Os testes usam o fake do client.
