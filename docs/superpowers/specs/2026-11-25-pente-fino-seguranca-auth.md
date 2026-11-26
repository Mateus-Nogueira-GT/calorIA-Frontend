# Pente fino: segurança de autenticação e conta

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-4-seguranca`.
Origem: auditoria do loop de pente fino (ledger em `docs/qa/pente-fino-ledger.md`, branch `fix/pente-fino-1`).
A1 e A2 foram provados com teste contra o `buildApp()` real. A3 foi confirmado na leitura.
Plano: [2026-11-25-pente-fino-seguranca-auth.md](../plans/2026-11-25-pente-fino-seguranca-auth.md).

**Prioridade:** A1 é crítico e já pode ser explorado em produção. Entra em deploy assim que o usuário aprovar.

## Requisitos

### R1 — A1: JWT forjado com JWKS hospedada no Storage (crítico)

**Como acontece.** `shared/auth-issuer.ts` aceita qualquer `iss` que comece com `SUPABASE_URL + '/'`. O
`get-jwks` busca a chave em `iss + '/.well-known/jwks.json'`, e o `verify` não confere `iss` nem `aud`.
O atacante sobe um "avatar" que na verdade é um JSON de JWKS (`uploadUserAvatar` não confere os bytes) e
assina um token com `iss = <url pública do avatar>#`. O backend aceita o token para qualquer `sub`,
inclusive o de um admin.

**Correções.** São defesas em camadas, e cada uma sozinha já fecha o ataque:

1. `isAllowedIssuer` exige `iss === ${SUPABASE_URL}/auth/v1`, sem barra final.
2. O `secret` não usa mais o `iss` do token como domínio. Ele busca a JWKS sempre do domínio fixo
   `${SUPABASE_URL}/auth/v1` e passa `issuersWhitelist` ao `buildGetJwks`.
3. O `verify` ganha `allowedIss: [${SUPABASE_URL}/auth/v1]` e `allowedAud: 'authenticated'`. Antes de fixar
   a audiência, conferir no código e nos testes se existe algum token legítimo com outra `aud`.
4. `uploadUserAvatar` confere a assinatura dos bytes (magic bytes de PNG, JPEG, WebP e HEIC/HEIF, conforme
   o que o app envia; ver `image-picker.service.ts`). Fora disso, devolve 422 `INVALID_IMAGE`. `image/svg+xml`
   é rejeitado. A extensão e o `contentType` gravados vêm do tipo detectado, e não do declarado.

**Aceite:**
- Teste no padrão de `/private/tmp/claude-501/pente-fino-audit-C/forge.test.ts`: um servidor HTTP local
  faz o papel de `SUPABASE_URL` e serve uma JWKS do atacante no caminho do avatar. Os tokens com `iss=<avatar>#`,
  `iss=<avatar>?x=` e `iss=${SUPABASE_URL}/qualquer` recebem 401.
- Um token legítimo, com `iss=${SUPABASE_URL}/auth/v1`, `aud=authenticated` e a chave servida em
  `/auth/v1/.well-known/jwks.json`, recebe 200.
- Um token com `aud` diferente recebe 401.
- Um avatar com bytes de JSON recebe 422.
- `auth-issuer.test.ts` é atualizado: caminhos arbitrários deixam de ser válidos.

### R2 — A2: rate limit responde 429, e não 500 (alta)

`server.ts:85-88`: o `errorResponseBuilder` passa a devolver `statusCode: 429`. O handler global
(`server.ts:180`) passa a respeitar o `statusCode` do erro.

No app, `api.ts:121-126` não trata um 429 em `/auth/refresh` como credencial recusada, e por isso não faz
logout.

**Aceite:**
- Backend: 12 chamadas a `/auth/login` do mesmo IP. As que passam do limite recebem 429 com
  `error: 'TOO_MANY_REQUESTS'`.
- App: um 429 no refresh mantém a sessão.

### R3 — A3: exclusão de conta idempotente (média-alta)

- `users.service.ts:207-227`: um `deleteUser` que devolve "user not found" (status 404 ou
  `code: 'user_not_found'`) é tratado como sucesso.
- `profile.service.ts:53`: a chamada de exclusão ganha um timeout de 60 s.

**Aceite:** o teste unitário com fake mostra que `deleteUser` → `user_not_found` resolve sem 502. O teste do
app mostra que a chamada usa `timeout >= 60000`.

### R4 — A8: 401 de rota `/auth/*` não derruba a sessão no web (baixa)

`api.ts:147-175`: as respostas 401 de URLs `/auth/` (fora `/auth/refresh`, que tem regra própria) não
disparam refresh nem `clearToken`.

**Aceite:** com o usuário logado, um 401 `INVALID_RESET_TOKEN` em `/auth/reset-password` mantém a sessão e
não chama o refresh.

### R5 — A9: login social sem e-mail não dá 500 (baixa)

`auth.service.ts:16` e `auth.schemas.ts:68`: o schema de resposta aceita `email` vazio ou nulo para usuários
Apple ou Google sem e-mail. A forma exata segue o que o app espera: conferir o tipo `User` do app.

**Aceite:** um login social de usuário sem e-mail devolve 200.

### R6 — A6: logout revoga a sessão no servidor (média-baixa)

`/auth/logout` lê o bearer, se houver, e chama `supabase.auth.admin.signOut(jwt)`, em best-effort: uma falha
só gera log. A resposta continua igual. O app já chama a rota (`useProfile.ts:80-86`); conferir que ela
envia o `Authorization`.

**Aceite:** o teste unitário mostra que o logout com bearer chama `admin.signOut` com o token, e que sem
bearer não chama.

## Fora de escopo (registrado, precisa de decisão do usuário)

- **A4 (alta, suspeito):** `/auth/register` cria a conta com `email_confirm: true`. Isso permite pré-sequestro
  da conta por quem cadastra o e-mail de outra pessoa antes do login social dela. Corrigir exige um fluxo de
  confirmação de e-mail, o que muda o onboarding.
- **A5 (média, suspeito):** `/auth/reset-password` aceita qualquer access token, e não só o de recuperação.
  Fixar a checagem de `amr` sem um Supabase real para conferir o formato pode quebrar a recuperação legítima.
- **A7:** o rate limit usa só o IP (o ramo por `sub` nunca roda) e fica em memória por instância.
- **A9b:** `GOOGLE_LOGIN_ACCOUNT` e `APPLE_LOGIN_ACCOUNT` permitem enumerar quais contas existem.

## Pós-correção recomendada (ação do usuário)

Fazer o deploy do backend o quanto antes. Revisar no bucket `avatars` os arquivos cujo conteúdo não é
imagem (por exemplo, JSON com `"keys"`) e, nos logs, as requisições com `iss` diferente de `/auth/v1`, para
saber se a falha já foi explorada.
