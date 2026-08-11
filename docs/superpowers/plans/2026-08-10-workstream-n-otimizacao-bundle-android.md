# Otimização e Hardening do Bundle Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar R8/minificação no release Android, remover logs e fallbacks de dev do bundle e entregar um `.aab` (versionCode 3) auditado que passe sem avisos de otimização no Play Console.

**Architecture:** Três mudanças pequenas e independentes (fail-fast de URL no JS, remoção de console no Babel, R8 no Gradle) seguidas de um rebuild único auditado e um smoke test de release — o R8 só quebra em runtime, então o gate de qualidade é executar o app, não compilar.

**Tech Stack:** React Native 0.76 (Hermes) · Gradle/AGP com R8 · Babel (`transform-remove-console`) · jest (baseline do app).

**Spec:** [2026-08-10-workstream-n-otimizacao-bundle-android.md](../specs/2026-08-10-workstream-n-otimizacao-bundle-android.md)

## Global Constraints

- Toolchain de release: `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=$HOME/Library/Android/sdk`; keystore lido de `~/.gradle/gradle.properties` (fora do repo).
- `app/.env` de produção antes de qualquer `bundleRelease`: `API_BASE_URL=https://calor-ia-frontend.vercel.app/api` (https obrigatório).
- Baselines preservadas: jest do app (`cd app && npx jest`) e vitest do backend intocado.
- `versionCode` final deste workstream: **3** (o 2 pode ter sido consumido por tentativa de upload anterior).
- Working tree parte com [app/android/app/build.gradle](../../../app/android/app/build.gradle) já modificado (versionCode 1→2, não commitado) — o commit da Task 4 absorve isso.
- Commits em pt-BR seguindo o padrão do repo (`fix(mobile):`, `build(android):`, `docs:`).

---

### Task 1: Fail-fast de `API_BASE_URL` em release

**Files:**
- Modify: `app/src/shared/services/api.ts:12-18` (função `resolveBaseUrl`)
- Test: `app/src/shared/services/api.baseurl.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `resolveBaseUrl(envUrl: string | undefined, platform?: string): string` — mesma assinatura pública; passa a lançar `Error` quando `!envUrl && !__DEV__`. Nenhum call-site muda (`api.ts` chama `resolveBaseUrl(API_BASE_URL)`).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do `describe` em `app/src/shared/services/api.baseurl.test.ts` (no jest, `__DEV__` é um global mutável que o preset RN define como `true`):

```ts
  it('release (__DEV__=false) sem env lança em vez de apontar para localhost', () => {
    const g = globalThis as { __DEV__?: boolean };
    g.__DEV__ = false;
    try {
      expect(() => resolveBaseUrl(undefined, 'android')).toThrow(/API_BASE_URL/);
      expect(() => resolveBaseUrl('', 'ios')).toThrow(/API_BASE_URL/);
      // com env presente, release funciona normalmente
      expect(resolveBaseUrl('https://caloria.vercel.app/api', 'android')).toBe(
        'https://caloria.vercel.app/api',
      );
    } finally {
      g.__DEV__ = true;
    }
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd app && npx jest src/shared/services/api.baseurl.test.ts`
Expected: FAIL — `resolveBaseUrl` retorna `http://10.0.2.2:3000` em vez de lançar.

- [ ] **Step 3: Implementação mínima**

Substituir o corpo de `resolveBaseUrl` em `app/src/shared/services/api.ts` (a referência direta a `__DEV__` é intencional: o Metro inlineia `false` no release e o minificador elimina o branch com as URLs de dev do bundle — ver DN5 da spec):

```ts
export function resolveBaseUrl(
  envUrl: string | undefined,
  platform: string = Platform.OS,
): string {
  if (envUrl) return envUrl;
  if (__DEV__) {
    return platform === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  }
  throw new Error(
    'API_BASE_URL ausente no build de release — configure app/.env antes de gerar o bundle.',
  );
}
```

Atualizar também o comentário JSDoc acima da função: trocar "Build de release deve SEMPRE ter API_BASE_URL https no .env" por "Em release, a ausência de API_BASE_URL lança na inicialização (fail-fast) — o fallback de dev só existe sob __DEV__".

- [ ] **Step 4: Rodar o arquivo de teste e confirmar que passa**

Run: `cd app && npx jest src/shared/services/api.baseurl.test.ts`
Expected: PASS (4 testes — os 3 existentes seguem verdes porque `__DEV__` é `true` no jest).

- [ ] **Step 5: Rodar a baseline completa do app**

Run: `cd app && npx jest`
Expected: baseline integral verde (nenhum outro teste importa `api.ts` com `__DEV__` alterado).

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/services/api.ts app/src/shared/services/api.baseurl.test.ts
git commit -m "fix(mobile): release sem API_BASE_URL falha explícito — fallback localhost só em __DEV__"
```

---

### Task 2: Remover `console.*` do bundle de release

**Files:**
- Modify: `app/babel.config.js`
- Modify: `app/package.json` (devDependency nova)

**Interfaces:**
- Consumes: nada.
- Produces: bundle gerado com `--dev false` sem chamadas `console.log`/`console.debug`/`console.info`; `console.error` e `console.warn` preservados (contrato com o `componentDidCatch` do `AppErrorBoundary`).

- [ ] **Step 1: Instalar o plugin**

```bash
cd app && npm i -D babel-plugin-transform-remove-console
```

- [ ] **Step 2: Adicionar o env `production` ao babel.config.js**

Em `app/babel.config.js`, acrescentar a chave `env` no objeto exportado, como irmã de `presets` e `plugins`:

```js
  // O Metro compila com env 'production' quando --dev false (build de release):
  // console.log/debug/info saem do bundle; error/warn ficam — o AppErrorBoundary
  // usa console.error e removê-lo cegaria o diagnóstico local via logcat.
  env: {
    production: {
      plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
    },
  },
```

- [ ] **Step 3: Verificar que o bundle de produção sai sem console.log**

Gerar um bundle JS plano (não-Hermes, para poder grepar) num diretório temporário:

```bash
cd app && npx react-native bundle --platform android --dev false \
  --entry-file index.js --bundle-output /tmp/caloria-audit.bundle --reset-cache
grep -c "console.log" /tmp/caloria-audit.bundle
```

Expected: `0` (ou apenas ocorrências dentro de strings de mensagens, não chamadas — inspecionar com `grep -o '.\{40\}console.log.\{40\}' | head` se der > 0).

- [ ] **Step 4: Confirmar que o env de teste não foi afetado**

Run: `cd app && npx jest`
Expected: baseline integral verde (jest roda no env padrão, sem o plugin; testes que espionam `console` não mudam).

- [ ] **Step 5: Commit**

```bash
git add app/babel.config.js app/package.json app/package-lock.json
git commit -m "build(mobile): remove console.log/debug/info do bundle de release (error/warn preservados)"
```

---

### Task 3: Ativar R8 e shrinkResources

**Files:**
- Modify: `app/android/app/build.gradle:60` (flag) e bloco `release` (~linha 116)
- Modify: `app/android/app/proguard-rules.pro`

**Interfaces:**
- Consumes: nada.
- Produces: `bundleRelease` minificado com mapping em `app/android/app/build/outputs/mapping/release/mapping.txt`; Task 4 depende deste build configurado.

- [ ] **Step 1: Ligar o R8**

Em `app/android/app/build.gradle:60`, trocar:

```groovy
def enableProguardInReleaseBuilds = false
```

por:

```groovy
// R8 ativo: minifica/ofusca o dex e habilita shrinkResources. O Play Console
// acusava "Otimização: Baixa" com isso desligado. Mudança aqui exige repetir
// o smoke test de release (docs/mobile-hardening.md §6) — R8 quebra em
// runtime (reflection), nunca em build.
def enableProguardInReleaseBuilds = true
```

- [ ] **Step 2: Ligar shrinkResources no buildType release**

No bloco `release { }` (que hoje tem `signingConfig signingConfigs.release`, `minifyEnabled`, `proguardFiles`), adicionar logo após a linha `minifyEnabled`:

```groovy
            shrinkResources enableProguardInReleaseBuilds
```

- [ ] **Step 3: Keep rules mínimas**

Substituir o conteúdo-comentário de `app/android/app/proguard-rules.pro` por:

```proguard
# Keep rules do CalorIA — manter o MÍNIMO: as libs RN modernas trazem
# consumer rules nos próprios AARs. Só adicionar regra nova aqui se o
# smoke test de release crashar (diagnóstico via adb logcat).

# Hermes: acesso via JNI a classes que o R8 não enxerga como usadas.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
```

- [ ] **Step 4: Build de validação**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd app/android && ./gradlew bundleRelease
```

Expected: `BUILD SUCCESSFUL`. Warnings de R8 sobre classes ausentes (`-dontwarn` candidates) podem aparecer; só agir se virarem **erro** de build — nesse caso adicionar o `-dontwarn <pacote>` indicado pela própria mensagem ao `proguard-rules.pro`.

- [ ] **Step 5: Conferir o mapping**

```bash
ls -la app/android/app/build/outputs/mapping/release/mapping.txt
```

Expected: arquivo existente e não-vazio (megabytes).

- [ ] **Step 6: Commit**

```bash
git add app/android/app/build.gradle app/android/app/proguard-rules.pro
git commit -m "build(android): ativa R8 (minify + shrinkResources) com keep rules mínimas de Hermes/JNI"
```

---

### Task 4: versionCode 3, rebuild final e auditoria do artefato

**Files:**
- Modify: `app/android/app/build.gradle:88` (`versionCode 2` → `versionCode 3`; o 2 está uncommitted na working tree e é absorvido aqui)

**Interfaces:**
- Consumes: Tasks 1–3 commitadas (o rebuild embute as três mudanças).
- Produces: `app/android/app/build/outputs/bundle/release/app-release.aab` auditado — insumo do smoke test (Task 5) e do upload.

- [ ] **Step 1: Conferir o `.env` de produção**

```bash
grep API_BASE_URL app/.env
```

Expected: `API_BASE_URL=https://calor-ia-frontend.vercel.app/api` (https). Se estiver com valor de dev, corrigir antes do build.

- [ ] **Step 2: Bump do versionCode**

Em `app/android/app/build.gradle:88`, trocar `versionCode 2` por `versionCode 3`.

- [ ] **Step 3: Rebuild limpo**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd app/android && ./gradlew clean bundleRelease
```

Expected: `BUILD SUCCESSFUL` (o `clean` garante que o `.aab` não reaproveita dex/assets antigos sem R8).

- [ ] **Step 4: Auditoria do artefato (checklist N4.2 da spec)**

```bash
AUDIT=$(mktemp -d) && cd "$AUDIT"
unzip -q /Users/mateusnascimentonogueiradasilva/CalorIA/app/android/app/build/outputs/bundle/release/app-release.aab

echo "— dex minificado (baseline sem R8: 11,4MB):" && du -ch base/dex/*.dex | tail -1
echo "— mapping embutido:" && ls -la BUNDLE-METADATA/com.android.tools.build.obfuscation/
echo "— URLs de dev (esperado 0):" && strings -n 6 base/assets/index.android.bundle | grep -c "10\.0\.2\.2\|localhost" || echo 0
echo "— console.log (esperado 0):" && strings -n 6 base/assets/index.android.bundle | grep -c "console\.log" || echo 0
echo "— URL de produção (esperado 1+):" && strings -n 6 base/assets/index.android.bundle | grep -c "calor-ia-frontend.vercel.app"
echo "— segredos (esperado 0):" && strings -n 8 base/assets/index.android.bundle | grep -ciE "sk-[a-zA-Z0-9]{20}|service_role" || echo 0
```

Expected: dex **< 8MB** (redução típica de R8 em RN é 30–50%), `proguard.map` presente, contadores de dev/console/segredos em 0, URL de produção presente. Qualquer desvio → parar e investigar antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add app/android/app/build.gradle
git commit -m "build(android): versionCode 3 para o upload com R8 ativo"
```

---

### Task 5: Smoke test do build de release

**Files:** nenhum (validação em runtime; só toca código se houver crash).

**Interfaces:**
- Consumes: `.aab`/config da Task 4 (o `run-android --mode release` recompila o mesmo buildType).
- Produces: veredito passa/falha do roteiro N5.2 — gate obrigatório antes do upload.

- [ ] **Step 1: Subir emulador e instalar o release**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
"$ANDROID_HOME/emulator/emulator" -list-avds   # escolher um AVD existente
"$ANDROID_HOME/emulator/emulator" -avd NOME_DO_AVD &
cd app && npx react-native run-android --mode release
```

(Alternativa com device físico: conectar via USB com depuração ativada e rodar o mesmo comando.)

- [ ] **Step 2: Executar o roteiro N5.2**

Em ordem, observando crash/tela branca em cada passo:

1. App abre até a tela de login (sem tela vermelha/branca).
2. Login com conta de teste → dashboard carrega com anel de calorias desenhado.
3. Registrar uma refeição pelo AddMealModal → aparece no log do dia.
4. Abrir o scanner → picker de imagem abre (pode cancelar).
5. `adb shell am start -a android.intent.action.VIEW -d "caloria://challenge/teste"` → app vem para frente sem crash.
6. Logout → volta ao login.

- [ ] **Step 3: Se houver crash — diagnosticar e corrigir**

```bash
adb logcat -d | grep -E "AndroidRuntime|FATAL|com.caloria" | tail -40
```

Padrão esperado de falha de R8: `ClassNotFoundException`/`NoSuchMethodError` citando a classe removida. Adicionar ao `proguard-rules.pro` uma keep rule **específica** para essa classe (nunca `-keep class ** { *; }` global), por exemplo:

```proguard
-keep class com.exemplo.ClasseCitadaNoLogcat { *; }
```

Depois: `cd app/android && ./gradlew bundleRelease`, reinstalar (`npx react-native run-android --mode release`) e repetir o roteiro do Step 2 desde o início. Commitar a regra junto da Task 5:

```bash
git add app/android/app/proguard-rules.pro
git commit -m "build(android): keep rule para <classe> — quebrava o release com R8 (logcat)"
```

- [ ] **Step 4: Registrar o veredito**

Roteiro completo sem crash = gate liberado para upload. Anotar no PR/commit final que o smoke test passou (data + emulador/device usado).

---

### Task 6: Documentação e artefato para upload

**Files:**
- Modify: `docs/mobile-hardening.md` (seção 6)

**Interfaces:**
- Consumes: resultado das Tasks 4–5.
- Produces: doc de release atualizado; `.aab` final na área de trabalho do usuário.

- [ ] **Step 1: Atualizar a seção "Publicação Android (Play Store)"**

Em `docs/mobile-hardening.md`, na seção 6, fazer estas três mudanças:

1. Trocar a linha do versionCode por: `**versionCode precisa ser incrementado a cada upload** (atual: 3 — próximo upload usa 4).`
2. Adicionar os bullets:

```markdown
- **R8 está ATIVO** (`enableProguardInReleaseBuilds = true` + `shrinkResources`):
  o dex é minificado/ofuscado e o `mapping.txt` de desofuscação vai **embutido
  no próprio .aab** (`BUNDLE-METADATA/.../proguard.map`) — nada a subir à parte.
- **Smoke test de release é obrigatório antes de todo upload**: R8 quebra em
  runtime (reflection), não em build. Roteiro: abrir app → login → dashboard →
  registrar refeição → scanner → deep link `caloria://` → logout
  (`npx react-native run-android --mode release`). Crash de R8 aparece no
  logcat como ClassNotFoundException/NoSuchMethodError → keep rule específica
  em `proguard-rules.pro`.
- **Logs em release**: `console.log/debug/info` são removidos pelo Babel
  (env `production`); `console.error`/`warn` permanecem de propósito.
- **Release sem `API_BASE_URL` no .env agora LANÇA na inicialização**
  (fail-fast) em vez de apontar silenciosamente para localhost.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mobile-hardening.md docs/superpowers/specs/2026-08-10-workstream-n-otimizacao-bundle-android.md docs/superpowers/plans/2026-08-10-workstream-n-otimizacao-bundle-android.md
git commit -m "docs: spec e plano do Workstream N + processo de release com R8 no mobile-hardening"
```

- [ ] **Step 3: Disponibilizar o artefato**

```bash
cp app/android/app/build/outputs/bundle/release/app-release.aab \
   ~/Desktop/app-release-v3.aab
```

Informar ao usuário: subir `~/Desktop/app-release-v3.aab` no Play Console (o `.aab` v2 antigo da área de trabalho fica obsoleto — descartar). O aviso de otimização deve desaparecer; os 3 erros de versionCode não voltam porque o código 3 é inédito.
