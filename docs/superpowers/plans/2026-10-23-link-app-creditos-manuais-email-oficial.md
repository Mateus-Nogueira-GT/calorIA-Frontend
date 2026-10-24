# Link no app, créditos manuais e e-mail oficial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin libera créditos e acesso ilimitado por conta; o link de convite abre o app instalado; o e-mail de recuperação sai do CalorIA.

**Architecture:** Créditos manuais entram no ledger existente como `kind = 'grant'`. O ilimitado é uma coluna da carteira que desvia `runCreditOperation` para o caminho sem cobrança. O link usa Universal Links / App Links em `app.caloriaoficial.com.br/convite`, com os arquivos de verificação servidos pelo build web na Vercel. O e-mail é SMTP próprio + modelo versionado, configurado no painel do Supabase.

**Tech Stack:** Fastify + Zod + postgres.js (vitest), React Native 0.85 (jest + RNTL), webpack (app web), Vercel, Supabase Auth, EAS Build.

**Spec:** [docs/superpowers/specs/2026-10-23-link-app-creditos-manuais-email-oficial.md](../specs/2026-10-23-link-app-creditos-manuais-email-oficial.md)

## Global Constraints

- Domínio dos links: `app.caloriaoficial.com.br` (L1). Se o dono escolher o `vercel.app`, troque só o host. O caminho continua `/convite`.
- App ID da Apple: `Z7U2XD3LS9.br.com.caloriaoficial.app`. Pacote Android: `br.com.caloriaoficial.app`.
- 1 crédito = 5 unidades (`CREDIT_POLICY.units_per_credit`). Liberação manual: 1 a 1.000 créditos (5 a 5.000 unidades), atalhos de 15, 50 e 100 créditos.
- Migrations publicadas não são editadas: toda mudança de schema vai em migration nova.
- Toda resposta nova ou alterada precisa estar no schema Zod da rota. O Fastify valida a resposta e devolve 500 se um campo divergir (foi a causa da rejeição Apple 2.1).
- Copy em português. Assunto do e-mail: "Redefina sua senha do CalorIA". Remetente: `CalorIA <nao-responda@caloriaoficial.com.br>`.
- Conta ilimitada continua sujeita ao teto diário de IA (`AI_QUOTA_EXCEEDED`).

## Review Focus

1. **App antigo vendo um lançamento `grant`:** o `CreditsScreen` trata todo lançamento que não é `welcome` como "Uso de IA". O teste do Task 5 cobre o rótulo novo, e a correção chega por OTA. Até lá, uma liberação aparece como "Uso de IA" com valor positivo.
2. **Liberação repetida pela rede ou por toque duplo:** a mesma `Idempotency-Key` credita uma vez só (teste no Task 2).
3. **Ilimitado ligado com uma operação em andamento:** a operação já reservada termina pelo caminho normal e debita. Só as novas ficam sem cobrança. Desligar no meio também não pode deixar reserva órfã (teste no Task 3).
4. **Liberação para conta sem carteira** (nunca usou IA): a carteira é criada com as boas-vindas e depois somada à liberação, sem perder as boas-vindas (teste no Task 2).
5. **`/.well-known/*` engolido pelo rewrite `/(.*) → /index.html`:** a Vercel serve o arquivo estático antes do rewrite, mas o AASA não tem extensão e precisa de `Content-Type: application/json` (checagem no Task 6).

---

## Parte A — Créditos manuais e ilimitado (02)

### Task 1: Migration do ledger e da carteira

**Files:**
- Create: `backend/supabase/migrations/20261023120000_credit_grants_unlimited.sql`
- Test: `backend/src/modules/credits/credit-grants.integration.test.ts` (mesmo harness de `credits.integration.test.ts`: `TEST_DATABASE_URL` local com `credits_test` no nome, senão `describe.skip`)

**Interfaces:**
- Produces:
  - `credit_ledger.kind` aceita `'grant'`, com `units BETWEEN 5 AND 5000`.
  - Novas colunas `credit_ledger.note text` (≤100) e `credit_ledger.idempotency_key text`, com `UNIQUE(actor_id, idempotency_key)`.
  - `credit_wallets.unlimited boolean NOT NULL DEFAULT false`, `unlimited_by uuid` e `unlimited_since timestamptz`.

- [ ] **Step 1: Teste falhando:** `it('aceita grant com actor e recusa grant fora da faixa')`: inserir `kind='grant', units=250` passa; `units=0`, `units=5005` e `units=-5` falham com check violation; um `UPDATE` em `note` de linha existente falha com `'credit ledger is append only'`.
- [ ] **Step 2:** `TEST_DATABASE_URL=… npx vitest run src/modules/credits/credit-grants.integration.test.ts` → FAIL (check constraint `kind`).
- [ ] **Step 3: Escrever a migration.** Recriar a constraint de `kind`/`units` incluindo `(kind='grant' AND units BETWEEN 5 AND 5000)`. Adicionar as colunas e a unique. Recriar `credit_ledger_immutable()` comparando também `note` e `idempotency_key`.
- [ ] **Step 4:** Rodar o teste → PASS. Rodar também `credits.integration.test.ts` → PASS (nada antigo quebrou).
- [ ] **Step 5:** Commit `feat(credits): ledger aceita liberação manual e carteira ganha ilimitado`.

### Task 2: Serviço de liberação e de ilimitado

**Files:**
- Create: `backend/src/modules/credits/credit-grants.service.ts`
- Test: `backend/src/modules/credits/credit-grants.integration.test.ts`

**Interfaces:**
- Consumes: Task 1; `ensureWallet(tx, userId)` e `validateIdempotencyKey(key)` de `credits.service.ts`.
- Produces:
  - `grantCredits(f, adminId: string, userId: string, credits: number, key: string | undefined, note?: string): Promise<{ balance_units: number; available_units: number; unlimited: boolean }>`
  - `setUnlimited(f, adminId: string, userId: string, unlimited: boolean): Promise<{ unlimited: boolean }>`
  - Erros: `AppError(404,'USER_NOT_FOUND')` para uma conta inexistente, `AppError(422,'INVALID_GRANT')` fora de 1–1.000 ou não inteiro.

- [ ] **Step 1: Testes falhando:**
  - `grantCredits(…, 50, key)` → `balance_units` sobe 250 e o ledger ganha 1 linha `grant` com `actor_id = admin`.
  - Mesma chave duas vezes → uma linha só, e o segundo retorno traz o mesmo saldo.
  - Conta sem carteira → saldo final `75 + 250 = 325`, com 2 linhas (`welcome` e `grant`).
  - `credits = 0`, `1001` e `2.5` → `INVALID_GRANT`.
  - `setUnlimited(true)` e depois `(false)` → coluna alterna, e `unlimited_by`/`unlimited_since` preenchidos ao ligar.
- [ ] **Step 2:** Rodar → FAIL (módulo não existe).
- [ ] **Step 3: Implementar.** Tudo numa transação. Para a idempotência: `INSERT … ON CONFLICT (actor_id, idempotency_key) DO NOTHING RETURNING id`, e só somar ao saldo se houve inserção. A conta precisa existir em `profiles`.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat(credits): liberação manual idempotente e acesso ilimitado`.

### Task 3: Conta ilimitada não paga créditos

**Files:**
- Modify: `backend/src/modules/credits/credits.service.ts` (`wallet` e `runCreditOperation`)
- Modify: `backend/src/modules/credits/credits.routes.ts` (`GET /credits/me` já espalha `wallet()`; conferir o schema, se houver)
- Test: `backend/src/modules/credits/credit-grants.integration.test.ts`

**Interfaces:**
- Produces: `wallet()` passa a devolver `unlimited: boolean`. `runCreditOperation` devolve `{ result, receipt: null }` para conta ilimitada, como no caminho com cobrança desligada.

- [ ] **Step 1: Testes falhando:**
  - Conta ilimitada com saldo 0 → `runCreditOperation` executa `infer`, não cria `credit_operations` e não insere `debit`.
  - Operação reservada antes de ligar o ilimitado → ao terminar, debita normalmente e `reserved_units` volta a 0.
  - `wallet()` → `unlimited: true`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3: Implementar.** Depois do `SELECT … FOR UPDATE` da carteira (que passa a ler `unlimited`), antes da checagem de saldo: se `unlimited` e não há `existing`, sair da transação e seguir pelo caminho sem cobrança (`infer` + `persist` com `fastify.db`). Operação `existing` segue o fluxo atual. O teto de IA fica onde está, dentro de `infer`.
- [ ] **Step 4:** Rodar este arquivo, `credits.integration.test.ts` e `credits.routes.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(credits): conta ilimitada usa IA sem reservar créditos`.

### Task 4: Rotas de admin, lista de usuários e visão geral

**Files:**
- Modify: `backend/src/modules/admin/admin.routes.ts` (no escopo principal, fora de `invitesRoutes`, por causa de C7)
- Modify: `backend/src/modules/admin/admin.schemas.ts`
- Modify: `backend/src/modules/admin/admin-users.service.ts` (seleciona `cw.unlimited`)
- Modify: `backend/src/modules/admin/admin-overview.service.ts` (soma `kind='grant'` em `manual_cur`/`manual_prev`)
- Test: `backend/src/modules/admin/admin.integration.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `POST /admin/users/:id/credits`, body `{ credits: int 1..1000, note?: string ≤100 }`, header `Idempotency-Key` → `200 { balance_units, available_units, unlimited }`
  - `PUT /admin/users/:id/unlimited`, body `{ unlimited: boolean }` → `200 { unlimited }`
  - `adminUserRowSchema` ganha `unlimited: z.boolean()`. `adminOverviewSchema` ganha o par `manual` no bloco de créditos, no mesmo formato de `auto`/`invite`.

- [ ] **Step 1: Testes falhando:** um não-admin recebe 404 nas duas rotas (guard fail-closed); um admin libera e a resposta passa no schema; `GET /admin/users` traz `unlimited`; o overview conta a liberação em `manual` e não em `auto`.
- [ ] **Step 2:** `npx vitest run src/modules/admin` → FAIL.
- [ ] **Step 3:** Implementar rotas, schemas e as duas consultas.
- [ ] **Step 4:** `npm test` no `backend` → PASS. `npm run build` → sem erro de tipo.
- [ ] **Step 5:** Commit `feat(admin): liberar créditos e ilimitado pela lista de usuários`.

### Task 5: Telas no app

**Files:**
- Create: `app/src/features/admin/components/UserCreditsSheet.tsx` (+ `.test.tsx`)
- Modify: `app/src/features/admin/components/UsersTab.tsx` (toque na linha abre o sheet; selo "Ilimitado")
- Modify: `app/src/shared/services/admin.service.ts` (`grantCredits(userId, credits, note?)` com `Idempotency-Key` gerada uma vez por abertura do sheet; `setUnlimited(userId, unlimited)`)
- Modify: `app/src/shared/services/credits.service.ts` (`Wallet.unlimited?: boolean`; `LedgerEntry.kind` inclui `'grant'`)
- Modify: `app/src/features/credits/screens/CreditsScreen.tsx` e `components/CreditBalance.tsx`
- Modify: `app/src/features/admin/components/OverviewTab.tsx` (card "Liberados manualmente")

**Interfaces:**
- Consumes: as rotas do Task 4.

- [ ] **Step 1: Testes falhando:**
  - `UserCreditsSheet`: tocar em "50" e confirmar chama `grantCredits(id, 50, undefined)` uma vez, mesmo com dois toques; o campo livre recusa 0 e 1001 com a mensagem "Informe de 1 a 1.000 créditos"; o switch "Acesso ilimitado" chama `setUnlimited(id, true)`.
  - `UsersTab`: uma linha com `unlimited: true` mostra "Ilimitado".
  - `CreditsScreen`: um lançamento `grant` mostra "Créditos liberados pela equipe"; com `wallet.unlimited` aparece "Créditos ilimitados" no lugar do saldo.
- [ ] **Step 2:** `cd app && npx jest src/features/admin src/features/credits` → FAIL.
- [ ] **Step 3:** Implementar. Depois de liberar, recarregar a página atual da lista para o saldo da linha refletir o novo valor.
- [ ] **Step 4:** `npx jest` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(app): liberar créditos e ilimitado na aba Usuários`. Publicar por OTA depois do deploy do backend, nunca antes: o app novo chama rotas que o backend antigo não tem.

## Parte B — Link do convite abre o app (01)

### Task 6: Arquivos de verificação de domínio no app web

**Files:**
- Create: `app/web/well-known/apple-app-site-association`
- Create: `app/web/well-known/assetlinks.json`
- Create: `app/scripts/copy-well-known.js` (copia para `web/dist/.well-known/`)
- Modify: `app/package.json` (`build:web` passa a ser `webpack --config web/webpack.config.js && node scripts/copy-well-known.js`)
- Modify: `vercel.json` (`headers`: `Content-Type: application/json` em `/.well-known/apple-app-site-association`)
- Test: `app/scripts/copy-well-known.test.js`

**Interfaces:**
- Produces:
  - AASA: `{"applinks":{"details":[{"appIDs":["Z7U2XD3LS9.br.com.caloriaoficial.app"],"components":[{"/":"/convite","comment":"convite de créditos"},{"/":"/convite/","comment":"com barra"}]}]}}`
  - `assetlinks.json`: `delegate_permission/common.handle_all_urls` para `br.com.caloriaoficial.app` com duas impressões SHA-256: a da chave de assinatura do app (Play Console → Integridade do app) e a do EAS (`keytool -printcert -jarfile` no `.aab`, ou o painel de credenciais do EAS).

- [ ] **Step 1: Teste falhando:** rodar o script num diretório temporário gera os dois arquivos em `.well-known/`; ambos são JSON válido; o AASA tem exatamente o `appID` acima; o `assetlinks.json` tem duas impressões no formato `^([0-9A-F]{2}:){31}[0-9A-F]{2}$`.
- [ ] **Step 2:** `npx jest scripts/copy-well-known.test.js` → FAIL.
- [ ] **Step 3:** Implementar e preencher as impressões reais. As duas precisam ser conferidas pelo dono no Play Console e no EAS antes do merge.
- [ ] **Step 4:** Teste → PASS. `npm run build:web` → `web/dist/.well-known/` contém os dois arquivos.
- [ ] **Step 5:** Commit `feat(web): arquivos de verificação de domínio para abrir o app`.

### Task 7: App reivindica o domínio e página web oferece as lojas

**Files:**
- Modify: `app/ios/calorIA/calorIA.entitlements` (`com.apple.developer.associated-domains` = `["applinks:app.caloriaoficial.com.br"]`)
- Modify: `app/android/app/src/main/AndroidManifest.xml` (novo `intent-filter` com `android:autoVerify="true"`, `scheme="https"`, `host="app.caloriaoficial.com.br"`, `pathPrefix="/convite"`)
- Modify: `app/src/navigation/RootNavigator.tsx` (atualizar o comentário do `linking`; os `prefixes` continuam só `caloria://`, porque o convite é lido por `inviteTokenFromURL`, fora do React Navigation)
- Modify: `app/src/features/invites/screens/InviteScreen.tsx` (na web, botões "Baixar na App Store" e "Baixar no Google Play")
- Test: `app/src/features/invites/store.test.ts`, `app/src/features/invites/screens/InviteScreen.test.tsx`

- [ ] **Step 1: Testes falhando:**
  - `inviteTokenFromURL('https://app.caloriaoficial.com.br/convite#<43 chars>')` → token; com `/convite/`, idem; com `?t=` no lugar do `#` → `null`.
  - `InviteScreen` com `Platform.OS = 'web'` mostra os dois botões de loja. No iOS/Android, não mostra.
  - O `RootNavigator` entrega ao `useInviteStore` o token de um evento `url` `https://app.caloriaoficial.com.br/convite#…`.
- [ ] **Step 2:** `npx jest src/features/invites src/navigation` → FAIL nos que dependem de código novo.
- [ ] **Step 3:** Implementar. Os links das lojas vão em constantes no próprio arquivo: App Store `https://apps.apple.com/app/id6806420106`, Play `https://play.google.com/store/apps/details?id=br.com.caloriaoficial.app`.
- [ ] **Step 4:** `npx jest` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5:** Commit `feat(app): link de convite abre o app instalado`.

### Task 8: Domínio, variável e build (operação)

Sem código. É feito pelo dono e conferido por quem executa.

- [ ] DNS: `CNAME app → cname.vercel-dns.com`. Vercel → projeto → Domains → adicionar `app.caloriaoficial.com.br` e aguardar o certificado.
- [ ] Conferir: `curl -sI https://app.caloriaoficial.com.br/.well-known/apple-app-site-association` → `200` com `content-type: application/json`. `curl -s …/.well-known/assetlinks.json` → o JSON do Task 6.
- [ ] Vercel → Environment Variables: `INVITE_PUBLIC_URL=https://app.caloriaoficial.com.br/convite` e redeploy. Links novos saem no domínio novo; os antigos continuam abrindo no navegador (L4).
- [ ] Builds novas iOS e Android pelo EAS (não é OTA), com versionCode/buildNumber incrementados.
- [ ] Android: `adb shell pm get-app-links br.com.caloriaoficial.app` → `app.caloriaoficial.com.br: verified`.
- [ ] Aceite da spec 01 nos dois aparelhos, tocando no link recebido pelo WhatsApp.

## Parte C — E-mail oficial (03)

### Task 9: Modelo versionado e SMTP próprio

**Files:**
- Create: `backend/supabase/templates/recovery.html` (HTML inline, sem imagens externas além do logo hospedado no app web, botão "Redefinir senha" para `{{ .ConfirmationURL }}`, aviso "Se você não pediu, ignore este e-mail", rodapé com o nome do app)
- Create: `backend/src/shared/email-templates.test.ts`
- Modify: `docs/operacao-ia.md` ou um novo `docs/email-transacional.md` (provedor, remetente, registros DNS e onde colar o modelo)

- [ ] **Step 1: Teste falhando:** `recovery.html` contém `{{ .ConfirmationURL }}` exatamente uma vez como `href`; não contém "Reset Your Password", "Follow this link" nem `supabase`; contém "Redefinir senha".
- [ ] **Step 2:** `npx vitest run src/shared/email-templates.test.ts` → FAIL.
- [ ] **Step 3:** Escrever o modelo e a doc.
- [ ] **Step 4:** Teste → PASS. Commit `docs(auth): e-mail de recuperação oficial do CalorIA`.
- [ ] **Step 5 (painel, feito pelo dono):**
  1. Criar a conta no provedor (Resend, E1) e verificar `caloriaoficial.com.br` com SPF, DKIM e DMARC.
  2. Supabase → Authentication → Emails → SMTP Settings: host, porta, usuário e senha do provedor; remetente `nao-responda@caloriaoficial.com.br`, nome `CalorIA`.
  3. Email Templates → Reset Password: assunto "Redefina sua senha do CalorIA" e corpo de `recovery.html`. Repetir para os outros modelos ligados (E4).
  4. Rate Limits: subir o limite de e-mails por hora (E5).
- [ ] **Step 6:** Aceite da spec 03 com uma conta Gmail e uma Outlook que **não** sejam da equipe do projeto Supabase.
