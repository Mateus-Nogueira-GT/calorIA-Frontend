# Workstream J — Mobile Crítico: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o app abrir e falar com a API em iOS/Android: `@env` resolvendo no Metro, URL de API por ambiente e câmera funcional no Android.

**Architecture:** Três correções independentes de configuração/serviço: plugin babel do dotenv (Metro), helper de baseURL com `Platform.select`, e permissão runtime + tratamento de `errorCode` no serviço de imagem.

**Tech Stack:** React Native 0.76 (bare), react-native-dotenv, react-native-image-picker, jest.

## Global Constraints

- Branch de trabalho: criar `fix/mobile-critico` a partir da branch integrada mais recente (`feat/coach-ia`); nunca implementar na main.
- Baseline de testes do app: 6 suítes pré-existentes falhando (não relacionadas) — nada além delas pode falhar.
- Todos os comandos do app rodam em `app/`.

---

### Task J1: Plugin `@env` no babel do Metro

**Files:**
- Modify: `app/babel.config.js`

**Interfaces:**
- Produces: módulo `@env` resolvível pelo Metro (mesmos exports que o webpack já fornece ao web).

- [ ] **Step 1: Reproduzir a falha (bundle nativo)**

Run: `cd app && npx react-native bundle --platform android --dev true --entry-file index.js --bundle-output /tmp/caloria-android.jsbundle --reset-cache 2>&1 | tail -5`
Expected: FAIL com `Unable to resolve module @env`

- [ ] **Step 2: Adicionar o plugin (antes do module-resolver)**

```js
// app/babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // O webpack (web) já tem este plugin no próprio config; o Metro (iOS/Android)
    // usa ESTE arquivo — sem ele, `import ... from '@env'` não resolve e o app
    // nem abre no nativo.
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json', '.node'],
        alias: {
          '@features': './src/features',
          '@shared': './src/shared',
          '@navigation': './src/navigation',
          '@theme': './src/theme',
        },
      },
    ],
  ],
};
```

- [ ] **Step 3: Verificar o bundle das duas plataformas**

Run: `npx react-native bundle --platform android --dev true --entry-file index.js --bundle-output /tmp/caloria-android.jsbundle --reset-cache 2>&1 | tail -2`
Run: `npx react-native bundle --platform ios --dev true --entry-file index.js --bundle-output /tmp/caloria-ios.jsbundle --reset-cache 2>&1 | tail -2`
Expected: ambos terminam com sucesso (sem "Unable to resolve").

- [ ] **Step 4: Confirmar que web e jest não regrediram**

Run: `npx jest src/shared 2>&1 | grep "Tests:"` → mesma contagem de antes.
Run: `npm run build:web 2>&1 | tail -1` → `compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/babel.config.js
git commit -m "fix(mobile): plugin react-native-dotenv no babel do Metro — @env não resolvia e o app não abria em iOS/Android"
```

---

### Task J2: URL de API por plataforma/ambiente

**Files:**
- Modify: `app/src/shared/services/api.ts`
- Modify: `app/.env.example`
- Test: `app/src/shared/services/api.baseurl.test.ts` (novo)

**Interfaces:**
- Produces: `resolveBaseUrl(envUrl: string | undefined, platform: string): string` (exportada para teste).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// app/src/shared/services/api.baseurl.test.ts
import { resolveBaseUrl } from './api';

describe('resolveBaseUrl', () => {
  it('usa a URL do .env quando presente (produção/dev configurado)', () => {
    expect(resolveBaseUrl('https://caloria.vercel.app/api', 'android')).toBe(
      'https://caloria.vercel.app/api',
    );
  });

  it('fallback Android → 10.0.2.2 (localhost do emulador é o próprio device)', () => {
    expect(resolveBaseUrl(undefined, 'android')).toBe('http://10.0.2.2:3000');
    expect(resolveBaseUrl('', 'android')).toBe('http://10.0.2.2:3000');
  });

  it('fallback iOS/web → localhost', () => {
    expect(resolveBaseUrl(undefined, 'ios')).toBe('http://localhost:3000');
    expect(resolveBaseUrl(undefined, 'web')).toBe('http://localhost:3000');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/shared/services/api.baseurl.test.ts`
Expected: FAIL — `resolveBaseUrl` não existe.

- [ ] **Step 3: Implementar em api.ts**

No topo de `app/src/shared/services/api.ts` (substituindo as 2 ocorrências de `API_BASE_URL || 'http://localhost:3000'`):

```ts
import { Platform } from 'react-native';

/**
 * URL da API: .env manda; sem .env, fallback de DEV por plataforma.
 * Android emulador: localhost é o próprio emulador → host é 10.0.2.2.
 * Release SEMPRE deve ter API_BASE_URL https no .env (iOS ATS bloqueia http).
 */
export function resolveBaseUrl(
  envUrl: string | undefined,
  platform: string = Platform.OS,
): string {
  if (envUrl) return envUrl;
  return platform === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const BASE_URL = resolveBaseUrl(API_BASE_URL);
```

Trocar `baseURL: API_BASE_URL || 'http://localhost:3000'` por `baseURL: BASE_URL` e, no `refreshAccessToken`, `` `${API_BASE_URL || 'http://localhost:3000'}/auth/refresh` `` por `` `${BASE_URL}/auth/refresh` ``.

- [ ] **Step 4: Rodar testes**

Run: `npx jest src/shared/services 2>&1 | grep "Tests:"`
Expected: PASS (3 novos + existentes).

- [ ] **Step 5: Documentar no .env.example**

```bash
# app/.env.example
# ── URL da API ─────────────────────────────────────────────
# PRODUÇÃO (build release iOS/Android): obrigatório, sempre https
#   API_BASE_URL=https://SEU-DEPLOY.vercel.app/api
# DEV iOS (simulador) e web:
#   API_BASE_URL=http://localhost:3000
# DEV Android (emulador — localhost é o próprio device):
#   API_BASE_URL=http://10.0.2.2:3000
API_BASE_URL=http://localhost:3000
API_TIMEOUT=10000
```

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/services/api.ts app/src/shared/services/api.baseurl.test.ts app/.env.example
git commit -m "fix(mobile): baseURL por plataforma (10.0.2.2 no Android) e .env.example com os 3 cenários"
```

---

### Task J3: Câmera Android — permissão runtime + errorCode

**Files:**
- Modify: `app/src/shared/services/image-picker.service.ts`
- Modify: `app/__mocks__/react-native-image-picker.js`
- Test: `app/src/shared/services/image-picker.service.test.ts`

**Interfaces:**
- Consumes: `PermissionsAndroid` (react-native), `launchCamera/launchImageLibrary`.
- Produces: `pickImage(source)` — agora lança `Error('CAMERA_PERMISSION_DENIED')` ou `Error(<errorCode>)`; `null` continua significando SÓ cancelamento.

- [ ] **Step 1: Estender o mock do picker**

```js
// app/__mocks__/react-native-image-picker.js
module.exports = {
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
};
```
(sem mudança estrutural — os testes configuram os retornos, incluindo `errorCode`).

- [ ] **Step 2: Escrever os testes que falham**

Adicionar em `app/src/shared/services/image-picker.service.test.ts`:

```ts
import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { pickImage } from './image-picker.service';

describe('pickImage — Android runtime permission (J3)', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    jest.restoreAllMocks();
  });

  it('permissão de câmera negada no Android → lança CAMERA_PERMISSION_DENIED', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied' as never);
    await expect(pickImage('camera')).rejects.toThrow('CAMERA_PERMISSION_DENIED');
    expect(launchCamera).not.toHaveBeenCalled();
  });

  it('errorCode do picker deixa de ser silêncio → lança', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
    (launchCamera as jest.Mock).mockResolvedValue({ errorCode: 'camera_unavailable' });
    await expect(pickImage('camera')).rejects.toThrow('camera_unavailable');
  });

  it('didCancel continua retornando null (cancelou ≠ erro)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted' as never);
    (launchCamera as jest.Mock).mockResolvedValue({ didCancel: true });
    await expect(pickImage('camera')).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx jest src/shared/services/image-picker.service.test.ts`
Expected: FAIL (permissão não é pedida; errorCode vira null).

- [ ] **Step 4: Implementar**

```ts
// app/src/shared/services/image-picker.service.ts
import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions } from 'react-native-image-picker';

const OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.8,
};

/**
 * Como o manifest declara android.permission.CAMERA, o react-native-image-picker
 * NÃO pede a permissão sozinho — sem este request o launchCamera falha em
 * silêncio (regra documentada da lib). iOS pede via Info.plist automaticamente.
 */
async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Permissão de câmera',
    message: 'O CalorIA usa a câmera para fotografar seus pratos.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Agora não',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function pickImage(source: 'camera' | 'gallery'): Promise<string | null> {
  if (source === 'camera' && !(await ensureCameraPermission())) {
    throw new Error('CAMERA_PERMISSION_DENIED');
  }
  const res =
    source === 'camera' ? await launchCamera(OPTIONS) : await launchImageLibrary(OPTIONS);
  if (res.didCancel) return null;
  // errorCode silencioso fazia o toque em "Tirar foto" não fazer NADA no
  // Android; agora estoura e o catch do CaptureScreen mostra o alerta certo.
  if (res.errorCode) throw new Error(res.errorCode);
  const asset = res.assets?.[0];
  if (!asset?.base64) return null;
  const mime = asset.type ?? 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}
```

- [ ] **Step 5: Rodar testes (novos + existentes do serviço)**

Run: `npx jest src/shared/services/image-picker.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Suíte completa na baseline**

Run: `npx jest 2>&1 | grep -E "Test Suites:|Tests:"`
Expected: mesmas 6 suítes pré-existentes falhando, nada novo.

- [ ] **Step 7: Commit**

```bash
git add app/src/shared/services/image-picker.service.ts app/src/shared/services/image-picker.service.test.ts
git commit -m "fix(mobile): permissão de câmera em runtime no Android + errorCode do picker deixa de ser silêncio"
```

---

### Task J4: Verificação final e push

- [ ] **Step 1:** `npx jest 2>&1 | grep "Test Suites:"` → baseline.
- [ ] **Step 2:** `npx tsc --noEmit` → sem erros novos vs baseline.
- [ ] **Step 3:** Re-rodar os 2 bundles do Task J1 Step 3 → sucesso.
- [ ] **Step 4:** `git push -u origin fix/mobile-critico` e abrir PR empilhado com o resumo dos 3 fixes.
