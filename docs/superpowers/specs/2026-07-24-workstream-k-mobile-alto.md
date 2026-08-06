# Spec — Workstream K: Mobile Alto (funciona errado em produção)

**Data:** 2026-07-24
**Origem:** Debug mobile (iOS/Android) — achados 🟠 #4, #5, #6 e #7.
**Pré-requisito:** Workstream J (o app precisa abrir para estes itens importarem).
**Plano de implementação:** `docs/superpowers/plans/2026-07-24-workstream-k-mobile-alto.md`

## 1. Objetivo

Corrigir o que roda mas quebra a experiência no nativo: datas do Postgres viram `Invalid Date` no Hermes, deep links nunca abrem o app, um crash de render fecha o app sem feedback, e o login social é uma mina armada.

## 2. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DK1 | Datas Postgres no app | Normalizar **no cliente** com `parseDbDate()` (espelho do normalizador que já existe no backend em `local-date.ts`: `' '→'T'`, offset `+00→+00:00`). Não mudar a serialização do backend (evita quebrar o web/PostgREST) |
| DK2 | `Invalid Date` residual | `timeAgo` → string vazia (oculta o carimbo); `getMealGroup` → 'Jantar' (comportamento atual de fallback); formatador de hora → '' |
| DK3 | Deep links | Registrar **`caloria://`** (custom scheme) no iOS (`CFBundleURLTypes`) e Android (`intent-filter` VIEW). **Universal/App Links (https) ficam para quando houver domínio próprio** — exigem `apple-app-site-association`/`assetlinks.json` hospedados |
| DK4 | Link do convite | URL do web app via env `APP_WEB_URL` (default `https://caloria.app`) para o fallback de quem não tem o app; o texto do share inclui também o `caloria://` para quem tem |
| DK5 | ErrorBoundary | Boundary raiz classe (`componentDidCatch`) em volta do `RootNavigator`, com tela PT de recuperação e botão "Tentar novamente" (reseta o state do boundary). Sem lib externa |
| DK6 | Social login | **Preparar** o código (guards já existem): `GoogleSignin.configure({ webClientId })` chamado uma única vez quando a lib existir, com `GOOGLE_WEB_CLIENT_ID` via `@env`. A **instalação** das libs nativas + credenciais (Firebase/Apple Developer) fica como checklist de ops documentado — não dá para automatizar daqui |

## 3. Requisitos

### K1 — Datas (Hermes-safe)
- **K1.1** Novo `app/src/shared/utils/parse-db-date.ts`: `parseDbDate(value: string): Date` que aceita ISO e o formato Postgres (`"2026-07-24 15:32:10.123+00"`), retornando `Date` inválido só se irrecuperável.
- **K1.2** [date.ts](../../../app/src/shared/utils/date.ts): `timeAgo` e `getMealGroup` passam a usar `parseDbDate`; `timeAgo` com data inválida retorna `''` (DK2).
- **K1.3** [FoodLogItem.tsx](../../../app/src/features/food-log/components/FoodLogItem.tsx): formatação de hora via `parseDbDate` + guarda de inválido.
- **K1.4** Testes: formato Postgres com/sem milissegundos, offset `+00` e `-03`, ISO puro, lixo → guardas.

### K2 — Deep links nativos
- **K2.1** [Info.plist](../../../app/ios/calorIA/Info.plist): `CFBundleURLTypes` com scheme `caloria`.
- **K2.2** [AndroidManifest.xml](../../../app/android/app/src/main/AndroidManifest.xml): `intent-filter` (VIEW + BROWSABLE + DEFAULT) para scheme `caloria`.
- **K2.3** [InviteButton.tsx](../../../app/src/features/challenges/components/InviteButton.tsx): usa `APP_WEB_URL` do `@env` (fallback atual) + inclui o deep link `caloria://challenge/<code>` na mensagem (DK4). `.env.example` documenta `APP_WEB_URL`.

### K3 — ErrorBoundary
- **K3.1** Novo `app/src/shared/components/AppErrorBoundary.tsx` (classe, `getDerivedStateFromError` + `componentDidCatch` com `console.error`), tela de fallback PT com botão de reset.
- **K3.2** [App.tsx](../../../app/App.tsx) envolve `RootNavigator` com o boundary.
- **K3.3** Teste: filho que lança → fallback renderiza; botão reset → filho re-renderiza.

### K4 — Social login (preparação)
- **K4.1** [google-signin.service.ts](../../../app/src/shared/services/google-signin.service.ts): `configure({ webClientId: GOOGLE_WEB_CLIENT_ID })` chamado lazy/uma vez antes do 1º `signIn` (quando a lib existir). Sem `GOOGLE_WEB_CLIENT_ID` → erro claro em vez de crash da lib.
- **K4.2** `.env.example` documenta `GOOGLE_WEB_CLIENT_ID`.
- **K4.3** `docs/mobile-social-login.md`: checklist de ops (instalar as 2 libs, pods, google-services.json / GoogleService-Info.plist, capability Sign in with Apple, aviso da guideline 4.8 da App Store).

## 4. Critérios de aceite

1. `timeAgo('2026-07-24 15:32:10.123+00')` correto em teste; `parseDbDate` cobre os 5 formatos.
2. `xcrun simctl openurl booted caloria://challenge/ABC` e `adb shell am start -a android.intent.action.VIEW -d "caloria://challenge/ABC"` abrem o app na tela do desafio.
3. Um throw proposital num componente mostra a tela de recuperação (não fecha o app); "Tentar novamente" volta ao app.
4. Com lib do Google ausente, nada muda (guards); com lib presente e sem `GOOGLE_WEB_CLIENT_ID`, o erro é a mensagem clara — não o throw interno da lib.
5. Baselines de jest/tsc inalteradas.

## 5. Fora de escopo

Universal/App Links https (dependem de domínio próprio — follow-up documentado); instalação efetiva das libs de social login; Sentry/crash reporting (Workstream L, documentado).
