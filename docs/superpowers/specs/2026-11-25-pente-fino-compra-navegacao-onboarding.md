# Pente fino: compra de créditos, deep links, notificações e onboarding

Data: 25/11/2026. Base: `origin/main` `4b6d53d` (PR #104). Branch: `fix/pente-fino-5`.

Origem: auditoria do loop de pente fino. O ledger está em `docs/qa/pente-fino-ledger.md`, na branch `fix/pente-fino-1`. E1–E5, E7 e E8 foram reproduzidos com testes descartáveis (`/private/tmp/claude-501/pente-fino-audit-E/`), e E6 foi confirmado lendo o código.

Plano: [2026-11-25-pente-fino-compra-navegacao-onboarding.md](../plans/2026-11-25-pente-fino-compra-navegacao-onboarding.md).

## Requisitos

### R1. E1: o banner "créditos adicionados" fala do pacote pago (média-alta)

Arquivo: `app/src/features/credits/screens/BuyCreditsScreen.tsx:123`, `:160-165` e `:227`.

O banner lê o pacote **pago**, guardado num estado próprio, e não o `selected`. Ao iniciar uma compra nova, a fase deixa de ser `paid`.

**Aceite:** pagar A e tocar em B com checkout falhando não mostra "B créditos foram adicionados".

### R2. E2: uma cadeia de polling por vez (média)

Arquivo: `BuyCreditsScreen.tsx:64-107` e `:177-185`.

Um `check()` não começa se já houver um em andamento: flag ou token de geração. Nenhum timer é agendado depois do unmount. O orçamento de tentativas vale por compra.

**Aceite:** com `get()` pendente, um AppState `active` e "Já paguei" fazem 1 requisição por tick, e nada dispara depois do unmount.

### R3. E3: toque duplo num pacote faz um checkout só (média-baixa)

Arquivo: `BuyCreditsScreen.tsx:121-128`.

A trava é por `ref`, no padrão do `InviteScreen`.

**Aceite:** dois toques antes do re-render chamam `checkout` uma única vez.

### R4. E10: o link da fatura se recupera no polling (baixa)

O `check()` copia `invoice_url` quando ele chega, e "Abrir pagamento" passa a usar esse valor.

**Aceite:** checkout com `invoice_url: null` seguido de `get()` com a URL faz o botão abrir a URL.

### R5. E9: o saldo atualiza ao voltar ao app (baixa-média)

O store de créditos, ou o `CreditBalance`, recarrega a carteira no AppState `active` quando o recurso está visível e há sessão. A recarga respeita as guardas de sessão que já existem no store.

**Aceite:** transição `background` → `active` chama `wallet()` de novo.

### R6. E4: deep link da Comunidade tem o Feed embaixo (média)

Arquivo: `app/src/navigation/RootNavigator.tsx:49-62`.

O `linking` da `Community` ganha `initialRouteName: 'Feed'`.

**Aceite:** `getStateFromPath('challenge/ABC', linking.config)` produz uma pilha `[Feed, ChallengeLeaderboard]`, e o mesmo vale para `post/:id`.

### R7. E5: notificações não vazam para a conta seguinte (média-baixa, privacidade)

Arquivo: `app/src/features/notifications/store.ts:25-61`.

`load`, `markRead` e `markAllRead` capturam o dono da sessão (`captureSessionOwner` de `@shared/services/session-owner`). Se o dono mudou, o resultado e o rollback são descartados.

**Aceite:** com load pendente, `clear()` e troca de sessão, a resolução deixa `items` vazio e `unreadCount` 0. Um `markAllRead` que falha depois do `clear` não restaura o snapshot.

### R8. E6: recuperar a foto remove o botão "Recuperar" (baixa-média)

Arquivo: `app/src/features/credits/components/PendingOperations.tsx:59-63`.

O ramo de foto chama `setPending(filter)` depois do `finishRequest`, como o ramo de chat já faz.

**Aceite:** depois de recuperar a foto, o botão sai da lista.

### R9. E7: altura aceita no perfil é aceita na geração de dieta (baixa)

Arquivo: `backend/src/shared/diet-ai-schema.ts:71`.

`COLLECTED_BOUNDS.heightCm` passa a usar os limites de `backend/src/shared/body-limits.ts`, como fonte única. Conferir também peso e idade.

**Aceite:** `collectedUserDataSchema` aceita `height_cm: 115` e recusa os mesmos valores que o schema do perfil recusa.

### R10. E8: idade vira `birth_date` no mesmo calendário em que o servidor valida (baixa)

Arquivo: `app/src/shared/services/auth.service.ts:98`.

O ano é calculado com `getUTCFullYear()`, que é o que o backend usa em `ageFromIsoDate`.

**Aceite:** com o relógio em `2026-12-31T23:30:00-03:00`, idade 30 gera um `birth_date` cuja idade no servidor é 30.

## Fora de escopo

- Link recebido deslogado é perdido e não volta depois do login. É comportamento de produto e fica registrado.
- Link de convite com o app aberto troca o `NavigationContainer` inteiro. É decisão de design e fica registrada.
- As métricas do admin têm só aproximações (retry contado duas vezes, ilimitados na conta de saldo zero), sem bug.
- `admin.service.ts` `getAdminMetrics` é código morto. Não foi removido: limpeza fica fora de pente fino de bugs.

## Limites

Só JS/TS, sem mudança nativa. O app sai por OTA.
