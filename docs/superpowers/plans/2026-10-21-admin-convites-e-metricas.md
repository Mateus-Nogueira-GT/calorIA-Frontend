# Admin: convites e métricas — Plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:executing-plans. Os passos usam checkbox (`- [ ]`).

**Objetivo:** área admin com visão geral do negócio, lista de usuários com métricas e convites com acompanhamento, no app e no navegador.

**Arquitetura:**
- Três rotas `GET /admin/*` só de leitura, atrás do `registerAdminGuard` que já existe.
- As métricas ficam fora do escopo `assertInvitesEnabled`: elas precisam funcionar mesmo com os convites desligados.
- No app, a `AdminScreen` ganha abas, e as rotas novas são consumidas pelo `adminService`.

**Stack:** Fastify/Zod/postgres.js/Vitest (+ PostgreSQL real no CI `credits-db.yml`); React Native/Expo/Jest.

**Spec:** [2026-10-21-admin-convites-e-metricas.md](../specs/2026-10-21-admin-convites-e-metricas.md)

## Restrições globais
- Nenhuma escrita em dados de usuário além do que já existe (criar e revogar convite).
- Não-admin recebe **404** em todas as rotas `/admin/*`.
- Sem dados de saúde (peso, altura, condições, refeições, conversas) em nenhuma resposta.
- Créditos sempre em **unidades** na API (5 = 1 crédito). O app formata com `formatCredits`.
- Nada nativo: o fingerprint continua `9a9173e…` / `0aee9a0…`.
- A migration nova só cria índices, com `IF NOT EXISTS`. Os endpoints funcionam sem ela, só mais lentos.

## Foco de revisão
- Conta sem carteira, sem refeições e sem uso de IA aparece na lista com zeros e `last_activity_at` nulo. Testado na Task 2.
- Busca com `%` ou `_` no termo não vira curinga. Testado na Task 2.
- Convite resgatado por uma conta depois excluída mostra "Conta excluída", sem quebrar a lista. Testado na Task 3.
- Período anterior sem dados: comparação mostrada como "—", sem divisão por zero. Testado nas Tasks 1 e 4.
- Métricas com os convites desligados: `/admin/overview` e `/admin/users` funcionam, e o bloco de convites mostra zeros. Testado nas Tasks 1 e 2.

---

### Task 1: `GET /admin/overview`
**Arquivos:**
- Criar: `backend/src/modules/admin/admin-overview.service.ts`, `backend/src/shared/ai-prices.ts`, `backend/src/modules/admin/admin.integration.test.ts`, `backend/supabase/migrations/024_admin_indexes.sql`.
- Modificar: `admin.routes.ts` (escopo de convites isolado) e `admin.schemas.ts`; `.github/workflows/credits-db.yml` passa a rodar também `admin.integration.test.ts`.

**Produz:**
- `type Metric = { value: number; previous: number }`.
- `getOverview(f, days: 7 | 30 | 90) => Overview`, com os blocos:
  - `users {total, newInPeriod: Metric, active7d, activeInPeriod: Metric, withActiveDiet}`;
  - `usage {photos, textMessages, voiceMessages, mealsLogged, dietsCompleted, dietsFailed: Metric}`;
  - `credits {welcomeAutoUnits, welcomeInviteUnits, consumedPhotoUnits, consumedMessageUnits: Metric; totalBalanceUnits, zeroBalanceAccounts}`;
  - `invites {created, redeemed: Metric; redemptionRate, expiredUnused, revoked}`;
  - `ai {byFeature: [{feature, calls, totalTokens, estimatedUsd: number | null}], totalEstimatedUsd}`.
- `estimateUsd(model, promptTokens, completionTokens) => number | null` em `ai-prices.ts`. Tabela datada de 21/10/2026:
  - `openai/gpt-6.1-sol`: 0,000002 / 0,00001 por token;
  - `google/gemini-3.8-flash-tts`: 0,0000005 / 0,000009 por token;
  - `openai/whisper-1`: US$ 0,006 por minuto, ou seja 0,000004 por token estimado (25 tokens por segundo).

**Definições** (spec R4):
- **Ativo:** a conta tem `meals.created_at`, `ai_usage.created_at` ou `credit_operations.created_at` na janela.
- **Fotos:** `ai_usage.feature='vision'`.
- **Voz:** `feature='transcribe'`. **Texto:** `max(chat − transcribe, 0)`.
- **Boas-vindas automáticas:** `credit_ledger` com `kind='welcome'` e `invite_id IS NULL`. **Boas-vindas por convite:** `kind='welcome'` e `invite_id NOT NULL`.
- **Consumo:** débitos do ledger juntados a `credit_operations.type`.
- **Taxa de resgate:** usados ÷ criados no período (0 quando não há criados).

**Passos:**
- [ ] Testes de integração (PostgreSQL real, schema mínimo + migrations de créditos):
  - com dados fixos, cada bloco bate com o esperado e o período anterior é separado do atual;
  - `days` fora de {7, 30, 90}: 400;
  - não-admin: 404;
  - convites desligados: overview responde 200.
- [ ] Teste unitário de `estimateUsd`.
- [ ] Implementar. As rotas novas ficam fora do hook `assertInvitesEnabled`, e as de convite num sub-plugin com esse hook. A migration 024 cria índices em `credit_ledger(created_at)`, `credit_operations(user_id, created_at)`, `meals(user_id, created_at)`, `ai_usage(feature, created_at)` e `credit_welcome_claims(invite_id)`.
- [ ] `npm test`, testes de integração locais, `tsc`, `biome`. Commit.

### Task 2: `GET /admin/users`
**Produz:**
- `listUsers(f, {q?, sort, cursor?, days}) => {items: AdminUserRow[]; next_cursor: string | null}`.
- `AdminUserRow = {id, name, email, created_at, last_activity_at, balance_units, photos, messages, has_active_diet, current_streak, joined_by_invite}`.
- Ordenações: `recent` (cadastro desc), `active` (última atividade desc, nulos no fim), `low_balance` (saldo asc), `ai_usage` (tokens do período desc), todas desempatadas por `id`.
- Cursor: offset em base64url (`o:<n>`), 25 por página.
- `q`: no mínimo 2 caracteres, com `%`, `_` e `\` escapados, `ILIKE` em nome e e-mail.

**Passos:**
- [ ] Testes de integração:
  - busca por pedaço de e-mail e de nome;
  - `%` literal não vira curinga;
  - as 4 ordenações;
  - paginação sem repetir nem pular (30 contas, duas páginas);
  - conta vazia com zeros e `last_activity_at` nulo;
  - nenhuma chave de saúde na resposta;
  - log de busca registra admin, termo e quantidade de resultados.
- [ ] Implementar e commit.

### Task 3: `GET /admin/credit-invites` com acompanhamento
**Produz** (nos itens que já existem):
- `claimed_by_name`, `claimed_by_email`, `claimed_at`;
- `usage_since_claim {debited_units, photos, messages}`.
- Filtro `status = active | used | expired | revoked`.

**Passos:**
- [ ] Testes de integração:
  - convite resgatado mostra a conta e o uso depois do resgate (sem contar o que veio antes);
  - filtro por status;
  - conta excluída aparece com nome e e-mail nulos e uso zero.
- [ ] Implementar, mantendo a paginação atual. PR 1 com as Tasks 1 a 3: CI, merge e deploy da API.

### Task 4: app — abas, visão geral, usuários e convites
**Arquivos:**
- Modificar: `app/src/shared/services/admin.service.ts` (`overview`, `users`, `invites(cursor, status)`) e `AdminScreen.tsx` (abas; o conteúdo atual vira a aba Convites).
- Criar: `features/admin/components/MetricCard.tsx`, `OverviewTab.tsx`, `UsersTab.tsx` e o item de convite com acompanhamento.
- Testes: `AdminScreen.test.tsx` (os casos atuais passam `initialTab="invites"`), `OverviewTab.test.tsx`, `UsersTab.test.tsx`, `MetricCard.test.tsx`.

**Produz:**
- `AdminScreen({ initialTab?: 'overview' | 'users' | 'invites' })`, com padrão `'overview'`.
- `formatDelta(value, previous) => string`: "+12%", "−5%", "igual", ou "—" quando `previous` é 0.

**Passos:**
- [ ] Testes:
  - abas trocam de conteúdo;
  - a visão geral mostra cada bloco, e o seletor 7/30/90 refaz a consulta com o `days` certo;
  - `formatDelta` cobre todos os casos;
  - a busca de usuários espera 300 ms digitando e só busca com 2 caracteres ou mais;
  - "Ver mais" pagina;
  - a lista de usuários mostra nome, e-mail, saldo em créditos e "Entrou por convite";
  - o item de convite resgatado mostra quem resgatou e o uso;
  - "Gerar outro com a mesma identificação" preenche o campo e gera;
  - o rótulo acessível do card inclui valor e comparação;
  - largura ≥ 900 px usa grade.
- [ ] Implementar. Rodar `npx jest`, `tsc`, ESLint nos arquivos tocados, build web local e fingerprint inalterado. PR 2: CI, merge e OTA.

### Task 5: política de privacidade
- [ ] `docs/politica-de-privacidade.md`: nova seção dizendo que administradores podem ver dados de conta (nome, e-mail, datas e contagens de uso, saldo) para operar o serviço, e nunca dados de saúde ou conversas. Atualizar a data. PR 3.

### Task 6: entrega
- [ ] Usuário aplica a migration `024_admin_indexes.sql` no Supabase. Ela não é obrigatória para funcionar.
- [ ] Smoke em produção: as rotas `/api/admin/*` sem token respondem 401. Com a conta admin, a tela abre as três abas no iPhone e no navegador.
