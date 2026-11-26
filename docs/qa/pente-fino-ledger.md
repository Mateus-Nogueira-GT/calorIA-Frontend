# Pente fino — ledger do loop de auditoria

Iniciado em 25/11/2026. Cada iteração do loop registra aqui a área revisada,
os achados (só conta como bug o que tem teste reproduzindo), o status e a branch.

Regras: nada de push, PR, OTA, migration remota ou flag de produção sem o usuário. Commits locais em
branches `fix/*`. Achado sem repro entra como "suspeito, não corrigido".

## Base

Local `main` estava em `f5ca5bf` (PR #70), 142 commits atrás de `origin/main`. O lote do debug de 18/10
(D01–D08) já foi corrigido e mergeado upstream. A auditoria roda sobre `origin/main` `4b6d53d` (PR #104),
no worktree `../calorIA-pente-fino`, para não tocar o checkout do usuário.

## Áreas a auditar (próximas iterações)

Backend: auth, users, scanner, food-log, diets, chat, challenges, feed, friends, weight,
notifications, admin, credits, credit-invites.
App: auth, scanner, dashboard/food-log, coach, social (feed/friends/challenges), credits/invites,
navigation, shared/services.

| Área | Iteração | Achados | Status |
|---|---|---|---|
| Baseline (typecheck, testes, lint) | 1 | Backend 598 ✓. App 849/849 ✓ com máquina livre; `ProfileSetupScreen`/`AddMealModal`/`ChatInput` estouram timeout só sob carga (flaky, não é bug de produto). Lint: 46 erros ESLint e alguns do Biome, todos de estilo (raw text dentro de `Button`, estilos não usados, `!`). | sem ação |
| Backend subscriptions/credit-purchases/credits (pagamentos Asaas) | 2 | **P1** (alta) dois toques no checkout criavam duas assinaturas no Asaas: corrigido em `e8a5131` (409 `CHECKOUT_IN_PROGRESS` para pending sem id há menos de 10 min; `UPDATE` do id exige pending e cancela a assinatura remota órfã). **P2** (média) compra sem id do Asaas bloqueava o pacote para sempre: corrigido em `47c5921` (migration `028_credit_purchases_inflight_index.sql`, índice só para pending; webhook grava `asaas_payment_id` em todo evento casado por `externalReference`). **P3** OVERDUE atrasado depois do CONFIRMED derrubava assinatura paga para `past_due` e **P4** assinatura nunca paga virava `past_due` e travava o checkout com `ALREADY_SUBSCRIBED`: corrigidos em `524ceb6`. **P5** `PAYMENT_UPDATED` com status REFUNDED/CONFIRMED adiantava o status e anulava o estorno: corrigido em `af91fe1`. **P6** com a recarga desligada, cobrança avulsa consultava `credit_purchases` (027 ausente derrubaria a fila do Asaas): corrigido em `044373d`. **P7** timeout no `createPayment` depois de o Asaas criar a cobrança deixa o pagamento órfão (webhook pago ignorado): suspeito/decisão de produto, não corrigido (pede estado "desconhecido" e reconciliação por `externalReference`). **P8** combinação de flags que mostra saldo zero no app: suspeito/decisão de produto, não corrigido. Spec/plano: `docs/superpowers/specs/2026-11-25-pente-fino-pagamentos-asaas.md`. | P1–P6 corrigidos em `fix/pente-fino-1` (só local; 028 não aplicada no Supabase remoto); P7/P8 abertos |
