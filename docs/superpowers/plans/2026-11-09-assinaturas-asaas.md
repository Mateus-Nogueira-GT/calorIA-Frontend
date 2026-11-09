# Plano: assinatura paga pelo Asaas (backend)

Spec: `docs/superpowers/specs/2026-11-09-assinaturas-asaas.md`

Branch `feat/assinaturas-asaas`. Um commit por tarefa, com TDD. Tudo atrás de
`SUBSCRIPTIONS_ENABLED=false`. A migração é aplicada à mão no Supabase, antes de ligar a flag.

## T1 — Migração `026_subscriptions.sql`
1. **Tabelas:**
   - `subscription_plans`;
   - `payment_customers` (`user_id` → `asaas_customer_id`, com cascade);
   - `subscriptions`, com cópia do plano, `paid_until` e `user_id ON DELETE SET NULL`;
   - `subscription_payments`, com chave no id do pagamento no Asaas;
   - `payment_webhook_events`, com chave no id do evento.
2. **Índice único parcial:** uma assinatura `pending`/`active`/`past_due` por usuário.
3. **`credit_ledger`:**
   - novos tipos `subscription` (> 0) e `subscription_reversal` (< 0);
   - coluna `payment_ref`, com `UNIQUE(payment_ref, kind)`;
   - trigger de imutabilidade recriado para proteger `payment_ref`.
4. **Acesso:** RLS e `REVOKE` em todas as tabelas novas, como as de crédito.
5. **Teste (`subscriptions.integration.test.ts`, PostgreSQL real):**
   - CHECKs dos planos;
   - índice único;
   - lançamento de assinatura repetido recusado;
   - imutabilidade;
   - exclusão de conta preserva o histórico.

   Entra no workflow `credits-db.yml`.

## T2 — Cliente Asaas (`asaas.client.ts`)
1. **Requisições:** `fetch` com `access_token`, `User-Agent: CalorIA/1.0` e timeout de 10 s. A
   base vem de `ASAAS_ENV` (`api-sandbox.asaas.com` ou `api.asaas.com`).
2. **Funções:** `createCustomer`, `createSubscription`, `listSubscriptionPayments` e
   `deleteSubscription`.
3. **Erros:**
   - falha do Asaas → `502 PAYMENT_PROVIDER_ERROR`, com a descrição no log e não para o usuário;
   - flag ligada sem chave → `503 PAYMENTS_UNAVAILABLE`.
4. **Testes:** com `fetch` injetado:
   - headers e corpo;
   - base por ambiente;
   - erro 400 do Asaas;
   - timeout.

## T3 — Planos e admin
1. **`plans.service.ts`:** `listActivePlans`, `listAllPlans`, `createPlan` e `updatePlan`.
   - `code` imutável;
   - erro 409 em `code` repetido;
   - regra "créditos ou ilimitado".
2. **Rotas:**
   - `GET /subscriptions/plans`;
   - `GET`/`POST /admin/subscription-plans`;
   - `PATCH /admin/subscription-plans/:id`.
3. **Testes:** schemas (limites de preço, ciclo, `code`) e o serviço com `fakeFastify`.

## T4 — Checkout, status e cancelamento
1. **Validação de CPF/CNPJ** (`cpf-cnpj.ts`), pelos dígitos verificadores.
2. **`checkout(userId, {plan_code, cpf_cnpj, name})`:**
   - plano ativo, senão 404;
   - **assinatura aberta:**
     - paga → 409 `ALREADY_SUBSCRIBED`;
     - `pending` do mesmo plano → devolve a mesma fatura;
     - `pending` de outro plano → cancela no Asaas e localmente;
   - cliente Asaas reaproveitado de `payment_customers`;
   - linha local `pending` antes da chamada ao Asaas (`externalReference` = id local). O
     índice único barra o checkout simultâneo, com 409 `CHECKOUT_IN_PROGRESS`;
   - assinatura no Asaas: `UNDEFINED`, vencimento hoje (data de São Paulo) e `callback.successUrl`
     se configurado;
   - se o Asaas falhar, a linha local é apagada;
   - a resposta traz o `invoiceUrl` do primeiro pagamento.
3. **`getMySubscription`:** estado, plano, `paid_until`, `entitled` e a fatura em aberto.
4. **`cancel`:**
   - chama `DELETE` no Asaas, depois marca `canceled` e `cancel_at_period_end`;
   - é idempotente;
   - **sem assinatura aberta:** 404.
5. **Testes:** cada ramo acima, com o cliente Asaas falso e `fakeFastify`.

## T5 — Webhook
1. **Rota `POST /webhooks/asaas`** num plugin sem JWT.
   - O token é conferido com `timingSafeEqual`.
   - A flag desligada responde 404.
2. **`handleAsaasEvent`, numa transação:**
   - `INSERT` do evento `ON CONFLICT DO NOTHING`; um evento repetido termina aí;
   - **pagamento confirmado** (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`):
     - grava o pagamento;
     - estende `paid_until` e marca `active`;
     - se houver créditos no plano, trava a carteira e lança no extrato pelo `payment_ref`, uma
       vez só;
   - `PAYMENT_OVERDUE` → `past_due`, se a assinatura não estiver cancelada;
   - **estorno** (`PAYMENT_REFUNDED`/`PAYMENT_PARTIALLY_REFUNDED`/`PAYMENT_CHARGEBACK_REQUESTED`):
     - retira até o saldo disponível;
     - se era o pagamento que sustentava o período, `paid_until = now()`;
   - `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` → `canceled`;
   - outro tipo de evento, ou assinatura que não é do CalorIA → só o registro.
3. **Erro de banco:** 500, com log `asaas_webhook_failed`.
4. **Testes:**
   - token ausente ou errado;
   - duplicata;
   - confirmação com e sem créditos;
   - `CONFIRMED` seguido de `RECEIVED` credita uma vez;
   - estorno com saldo menor que os créditos;
   - evento desconhecido.

   Também entram no teste de PostgreSQL real.

## T6 — Créditos
1. **`hasUnlimitedSubscription(tx, userId)`**, consultado só com a flag ligada, em
   `runCreditOperation` e em `wallet()`.
2. **`GET /credits/ledger`:** passa a listar os tipos novos.
3. **Testes:**
   - flag desligada → nenhuma consulta às tabelas novas;
   - ilimitado pago → sem débito;
   - período vencido → debita.

## T7 — Exclusão de conta
1. **`deleteUserAccount`:** com a flag ligada, cancela a assinatura aberta no Asaas antes de
   apagar a conta, em modo best-effort, com log em caso de falha.
2. **Teste:** a falha no Asaas não impede a exclusão.

## T8 — Configuração, documentação e entrega
1. `env.ts` e `.env.example` com as 5 variáveis novas.
2. **`docs/operacao-assinaturas.md`:**
   - aplicar a migração;
   - criar a chave e o webhook no sandbox, com os eventos de cobrança e assinatura e o token;
   - cadastrar planos;
   - testar o pagamento no sandbox;
   - virar para produção;
   - consultas úteis.
3. **Validação:** suítes completas (vitest, tsc e biome nos arquivos tocados) e o teste de
   PostgreSQL local.
4. **PR:** abrir e acompanhar o CI. O merge espera a autorização no chat.
5. **Verificação sem login:** com a flag desligada, `POST /webhooks/asaas` → 404.

## Ordem
- T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8.
- T2 e T3 são independentes entre si.
