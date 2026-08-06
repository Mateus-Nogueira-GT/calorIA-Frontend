# Spec — Workstream J: Mobile Crítico (app não roda)

**Data:** 2026-07-24
**Origem:** Debug mobile (iOS/Android) — achados 🔴 #1, #2 e #3.
**Plano de implementação:** `docs/superpowers/plans/2026-07-24-workstream-j-mobile-critico.md`

## 1. Objetivo

Fazer o app **abrir e falar com a API** em iOS e Android. Hoje o bundle nativo nem carrega (`@env` não resolve no Metro), não existe URL de API para builds mobile e a câmera é silenciosamente morta no Android.

## 2. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DJ1 | Resolução do `@env` no Metro | Plugin `module:react-native-dotenv` no `babel.config.js` (mesma config do webpack: `moduleName: '@env'`, `allowUndefined: true`) — **antes** do `module-resolver` |
| DJ2 | Fallback de dev da API | `Platform.select`: Android → `http://10.0.2.2:3000` (emulador), demais → `http://localhost:3000`. Release SEMPRE via `.env` com URL https |
| DJ3 | `.env` no repositório | `.env` continua fora do git; `.env.example` documenta os 3 cenários (iOS sim, Android emu, produção) |
| DJ4 | Permissão de câmera Android | Pedir em **runtime** via `PermissionsAndroid` antes do `launchCamera` (a permissão declarada no manifest obriga o request manual — regra do react-native-image-picker). Negada → erro tratável, não silêncio |
| DJ5 | Erros do picker | `res.errorCode` deixa de ser ignorado: vira `throw` → o `catch` existente do CaptureScreen mostra o alerta de permissões |

## 3. Requisitos

- **J1.1** [babel.config.js](../../../app/babel.config.js) ganha `['module:react-native-dotenv', { moduleName: '@env', path: '.env', safe: false, allowUndefined: true }]` como primeiro plugin.
- **J1.2** Verificação sem emulador: `npx react-native bundle --platform android` e `--platform ios` completam sem "Unable to resolve module @env".
- **J2.1** [api.ts](../../../app/src/shared/services/api.ts): fallback de `baseURL` e da URL de refresh via `Platform.select` (DJ2), num único helper `resolveBaseUrl()`.
- **J2.2** [.env.example](../../../app/.env.example) documenta: produção (`https://SEU-DEPLOY.vercel.app/api`), dev iOS/sim (`http://localhost:3000`), dev Android emulador (`http://10.0.2.2:3000`).
- **J3.1** [image-picker.service.ts](../../../app/src/shared/services/image-picker.service.ts): `ensureCameraPermission()` (Android → `PermissionsAndroid.request(CAMERA)` com rationale em PT; iOS/web → true). Negada → `throw Error('CAMERA_PERMISSION_DENIED')`.
- **J3.2** `pickImage` lança `Error(res.errorCode)` quando o picker retorna `errorCode` (em vez de retornar `null`).
- **J3.3** Testes em `image-picker.service.test.ts`: permissão negada lança; `errorCode` lança; `didCancel` retorna null; sucesso retorna data URL (mock de `react-native-image-picker` estendido com `errorCode`).

## 4. Critérios de aceite

1. `npx react-native bundle` (android e ios) completa sem erro de `@env`.
2. Com `.env` ausente, `api.ts` resolve `10.0.2.2` no Android e `localhost` no resto (teste unitário do helper).
3. No Android: 1º toque em "Tirar foto" abre o diálogo de permissão; negando, aparece o Alert de permissões (não silêncio); concedendo, a câmera abre.
4. Suíte jest do app na baseline (6 suítes pré-existentes falhando, nada novo).

## 5. Fora de escopo

Deep links, ErrorBoundary, social login (Workstream K); demais itens (Workstream L).
