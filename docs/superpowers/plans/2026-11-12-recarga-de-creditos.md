# Plano: recarga de créditos pelo Asaas

Spec: `docs/superpowers/specs/2026-11-12-recarga-de-creditos.md`

Branch `feat/recarga-creditos`. TDD, um commit por tarefa. Backend pela Vercel, app por OTA.
A migração 027 roda à mão, depois da 026.

## T1 — Migração 027
1. **Tabelas:**
   - `credit_packages`;
   - `credit_purchases`, com cópia de créditos e preço, `asaas_payment_id` único, status e
     unidades creditadas e estornadas.
2. **Extrato:** tipos `purchase` (5 a 500.000) e `purchase_reversal` (< 0). A CHECK de
   `payment_ref` passa a cobrir os 4 tipos de pagamento.
3. **Acesso:** RLS e `REVOKE`.
4. **Teste em PostgreSQL real:** CHECKs, unicidade e exclusão de conta.

## T2 — Backend da compra
1. **Cliente Asaas:** ganha `createPayment`.
2. **`credit-purchases.service`:**
   - `listPackages`;
   - `hasCustomer`;
   - `checkout`: reaproveita o cliente, exige CPF na primeira compra, reaproveita a compra
     pendente de menos de 24 h e cria a linha local antes do Asaas;
   - `getPurchase`, só a do próprio usuário.
3. **Rotas** `/credit-purchases` e admin `/admin/credit-packages`.
4. **Flag** `CREDIT_PURCHASES_ENABLED`.

## T3 — Webhook
1. **Roteamento:** pagamento sem `subscription` → procura em `credit_purchases` pelo
   `asaas_payment_id`.
2. **Confirmado:** credita uma vez, pelo `payment_ref` com tipo `purchase`.
3. **Estorno:** retira até o saldo.
4. **Removido ou vencido:** a compra fica `canceled` ou `expired`.
5. **Rota:** fica ativa se qualquer uma das duas flags estiver ligada.
6. **Testes em PostgreSQL real.**

## T4 — App
1. **`purchases.service`:** pacotes, cliente, checkout e status.
2. **Tela `BuyCreditsScreen`:**
   - pacotes;
   - formulário de CPF só na primeira compra;
   - `Linking.openURL`;
   - conferência da compra a cada 5 s, por até 2 min, e ao voltar ao app.
3. **Tela de Créditos:** botão Comprar créditos e extrato com os tipos novos.
4. **Saldo insuficiente:** `creditErrorMessage` aponta para a compra, e o coach e o scanner
   mostram o botão.
5. **Admin:** aba Pacotes.
6. **Testes (Jest):** serviço, tela (CPF só na primeira vez, polling) e aba do admin.

## T5 — Entrega
1. Suítes completas, PR, CI e merge (com autorização).
2. Migração 027 enviada ao usuário.
3. **Variáveis na Vercel:** `CREDIT_PURCHASES_ENABLED=true` e a chave do sandbox.
4. Pacotes de teste: 10, 25 e 50 créditos a R$ 6 por crédito.
5. **Teste no sandbox:** compra → pagamento → créditos.
6. **Ligar a cobrança:** `CREDITS_ENFORCEMENT_ENABLED=true` **só com o Asaas em produção**,
   com a confirmação do usuário.
