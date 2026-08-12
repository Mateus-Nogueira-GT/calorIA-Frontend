# Migração React Native 0.77 (16 KB) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o app de React Native 0.76.9 para 0.77.3 (com screens 4.x, NDK 27 e Kotlin 2.0.21) para que todas as libs nativas do `.aab` saiam alinhadas a 16 KB, destravando a publicação na Play Store.

**Architecture:** Quatro mudanças em camadas — bumps JS (package.json), toolchain Android (NDK/Kotlin), build de release e auditoria — cada uma com verificação própria antes da seguinte. O alvo já foi provado antes do plano: os AARs 0.77.3 do Maven Central foram medidos e saem em `0x4000`. O gate final continua sendo o smoke test manual em device (indisponível nesta máquina).

**Tech Stack:** React Native 0.77.3 (Hermes, New Architecture) · react-native-screens 4.x · NDK 27.1.12297006 · Kotlin 2.0.21 · Gradle 8.10.2 / AGP via RN gradle plugin · jest 29 (baseline do app).

**Spec:** [2026-08-12-workstream-o-rn077-16kb.md](../specs/2026-08-12-workstream-o-rn077-16kb.md)

## Global Constraints

- **Disco: ≥ 10 GB livres antes de qualquer task de build** (medição de 2026-08-12: 585 MB livres — bloqueado até o usuário liberar espaço). Task 1 verifica e PARA se insuficiente.
- Toolchain: `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=$HOME/Library/Android/sdk`; keystore em `~/.gradle/gradle.properties`.
- `app/.env` de produção: `API_BASE_URL=https://calor-ia-frontend.vercel.app/api` (a task Gradle `verifyReleaseApiBaseUrl` falha o build sem isso — correto).
- **Não mudam:** `react@18.3.1`, `react-test-renderer@18.3.1`, `react-native-web@^0.19.13`, compileSdk/targetSdk 36, `buildToolsVersion "35.0.0"`, Gradle 8.10.2, `newArchEnabled=true`, `hermesEnabled=true`, R8/shrinkResources/keep rules, babel `env.production`, guarda de env.
- Baseline jest do app: 6 suítes / 11 testes já falham em `main` (OnboardingOptionCard, LoginScreen, RegisterScreen, DashboardScreen, DietProgressHeader, MealPlanCard) — 11 failed / 227 passed / 238 total. Preservada = mesmas 11 falhas, zero novas.
- Backend (`backend/`) intocado.
- versionCode default deste workstream: **6** (5 foi consumido). Override: `-PcaloriaVersionCode=N`.
- Commits pt-BR no padrão do repo (`build(mobile):`, `build(android):`, `docs:`).
- Branch de trabalho: `feat/rn077-16kb`, criada de `origin/main` com merge de `docs/bloqueador-16kb` (o item 8 do mobile-hardening vive só lá).

---

### Task 1: Pré-flight — disco, branch e ambiente

**Files:** nenhum (verificações e git).

**Interfaces:**
- Consumes: branch `docs/bloqueador-16kb` (commit `fed36dd`, item 8 do mobile-hardening).
- Produces: branch `feat/rn077-16kb` pronta, ambiente validado — pré-condição de todas as tasks seguintes.

- [ ] **Step 1: Gate de disco**

```bash
df -h / | tail -1
```

Expected: coluna "Avail" com **≥ 10Gi**. Se menor: **PARAR** e reportar ao usuário — nenhuma task seguinte roda. Liberar espaço é decisão do usuário (candidatos: `~/Downloads` 32 GB, `~/.gradle/caches` 5 GB, `app/android/app/build` 1,4 GB).

- [ ] **Step 2: Criar a branch a partir de main + item 8**

```bash
cd /Users/mateusnascimentonogueiradasilva/CalorIA
git fetch origin main
git checkout -b feat/rn077-16kb origin/main
git merge docs/bloqueador-16kb -m "Merge branch 'docs/bloqueador-16kb' em feat/rn077-16kb"
grep -c "## 8\." docs/mobile-hardening.md
```

Expected: merge sem conflito; grep retorna `1` (item 8 presente).

- [ ] **Step 3: Conferir o `.env` de produção**

```bash
grep "^API_BASE_URL=" app/.env
```

Expected: `API_BASE_URL=https://calor-ia-frontend.vercel.app/api`. Diferente disso: corrigir antes de seguir.

---

### Task 2: Bumps JS — react-native 0.77.3, screens 4.x, presets

**Files:**
- Modify: `app/package.json`, `app/package-lock.json`

**Interfaces:**
- Consumes: branch da Task 1.
- Produces: `node_modules` com RN 0.77.3 — insumo do build da Task 4. Versões exatas que a Task 4 assume: `react-native@0.77.3`, `react-native-screens@4.12.0`, `@react-native-community/cli@^16.0.0`, `@react-native/*@^0.77.3`.

- [ ] **Step 1: Aplicar os bumps**

O pin exato do screens em **4.12.0** é deliberado. Um range `^4.5.0` resolveria para 4.26+, que exige RN 0.84+. E a 4.13.1 — pin original desta spec — introduziu `fabric/BottomTabs*` e `fabric/gamma/*`, cujo codegen o babel-plugin-codegen do RN 0.77 não parseia: quebra o `build:web` com 6 erros, embora o Metro empacote sem reclamar. A 4.12.0 é a mais nova sem esses módulos.

```bash
cd /Users/mateusnascimentonogueiradasilva/CalorIA/app
npm i react-native@0.77.3 react-native-screens@4.12.0 --save-exact
npm i -D @react-native/babel-preset@^0.77.3 @react-native/eslint-config@^0.77.3 \
  @react-native/metro-config@^0.77.3 @react-native/typescript-config@^0.77.3 \
  @react-native-community/cli@^16.0.0
```

Expected: install sem `ERESOLVE`. Se houver conflito de peer deps, ler a mensagem e resolver a versão apontada — **não** usar `--force`/`--legacy-peer-deps` (mascaram incompatibilidade real).

- [ ] **Step 2: Conferir que o que não devia mudar não mudou**

```bash
node -e "const p=require('./package.json'); console.log(p.dependencies.react, p.dependencies['react-native'], p.dependencies['react-native-web'], p.devDependencies['react-test-renderer'])"
```

Expected: `18.3.1 0.77.3 ^0.19.13 18.3.1`.

- [ ] **Step 3: Baseline jest**

```bash
npx jest 2>&1 | tail -4
```

Expected: `11 failed, 227 passed, 238 total` — as mesmas 6 suítes da Global Constraint. Falha NOVA (suíte fora da lista): investigar antes de commitar; causa típica é mudança no preset jest do RN 0.77 (ex.: `react-test-renderer.act`). Corrigir o teste ou o setup, nunca deletar teste para "passar".

- [ ] **Step 4: Build web**

```bash
npm run build:web 2>&1 | tail -3
```

Expected: `webpack 5.x compiled successfully` (o webpack compartilha o `babel.config.js`, então o preset 0.77 também roda no caminho web).

- [ ] **Step 5: Commit**

```bash
cd /Users/mateusnascimentonogueiradasilva/CalorIA
git add app/package.json app/package-lock.json
git commit -m "build(mobile): react-native 0.77.3 + screens 4.x — migração 16 KB (Workstream O)"
```

---

### Task 3: Toolchain Android — NDK 27, Kotlin 2.0.21, versionCode 6

**Files:**
- Modify: `app/android/build.gradle` (linhas do `ext`: ndkVersion, kotlinVersion e comentário do Kotlin)
- Modify: `app/android/app/build.gradle` (versionCode default 5 → 6)

**Interfaces:**
- Consumes: nada além da Task 1.
- Produces: toolchain que a Task 4 usa. Valores exatos: `ndkVersion = "27.1.12297006"`, `kotlinVersion = "2.0.21"`, `versionCode (project.findProperty('caloriaVersionCode') ?: 6) as Integer`.

- [ ] **Step 1: NDK e Kotlin em `app/android/build.gradle`**

Trocar:

```groovy
        ndkVersion = "26.1.10909125"
```

por:

```groovy
        // NDK r27+ é o que alinha as libs compiladas AQUI (appmodules, rnscreens,
        // codegen) a páginas de 16 KB. As libs pré-compiladas vêm alinhadas dos
        // AARs do RN 0.77+. Ver mobile-hardening.md item 8.
        ndkVersion = "27.1.12297006"
```

E trocar o bloco do Kotlin (as 6 linhas: o comentário de 5 linhas sobre "Kotlin fica em 1.9.x..." + a linha `kotlinVersion = "1.9.25"`):

```groovy
        // Kotlin 2.0.21 é o do template do RN 0.77 (a trava em 1.9.x era do
        // gradle-plugin do RN 0.76). O AsyncStorage permanece na série 2.x por
        // escolha (API idêntica à 3.x, zero ganho na troca — YAGNI), não mais
        // por incompatibilidade de Kotlin.
        kotlinVersion = "2.0.21"
```

- [ ] **Step 2: versionCode 6 em `app/android/app/build.gradle`**

Trocar:

```groovy
        versionCode (project.findProperty('caloriaVersionCode') ?: 5) as Integer
```

por:

```groovy
        versionCode (project.findProperty('caloriaVersionCode') ?: 6) as Integer
```

- [ ] **Step 3: Verificar que o Gradle ainda configura**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd /Users/mateusnascimentonogueiradasilva/CalorIA/app/android && ./gradlew :app:tasks --dry-run 2>&1 | tail -3
```

Expected: sem erro de configuração (a fase de configuração valida sintaxe e resolução do plugin com Kotlin 2).

- [ ] **Step 4: Commit**

```bash
cd /Users/mateusnascimentonogueiradasilva/CalorIA
git add app/android/build.gradle app/android/app/build.gradle
git commit -m "build(android): NDK 27 + Kotlin 2.0.21 (template RN 0.77) e versionCode 6"
```

---

### Task 4: Build de release

**Files:** nenhum commitado (artefatos de build). Só toca código se o build quebrar — e aí com diagnóstico documentado no relatório da task.

**Interfaces:**
- Consumes: Tasks 2 e 3 commitadas.
- Produces: `app/android/app/build/outputs/bundle/release/app-release.aab` — insumo da auditoria (Task 5).

- [ ] **Step 1: Build limpo (a primeira execução baixa o NDK 27, ~2–4 GB — demora)**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd /Users/mateusnascimentonogueiradasilva/CalorIA/app/android && ./gradlew clean bundleRelease 2>&1 | tail -25
```

Rodar em FOREGROUND com timeout de pelo menos 30 minutos (1800000 ms). Expected: `BUILD SUCCESSFUL`, com as tasks `verifyReleaseApiBaseUrl` e `minifyReleaseWithR8` na saída.

- [ ] **Step 2: Se o build falhar — diagnóstico por categoria (não silenciar)**

| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro de codegen citando `rnscreens`/`RNSScreen` | screens incompatível | Conferir que `node_modules/react-native-screens/package.json` marca exatamente `4.12.0` (Task 2 pina); se o erro persistir com a versão certa, testar a borda inferior da janela (`4.5.0`) e documentar |
| Erro Kotlin em `async-storage`/`image-picker`/`safe-area` | lib antiga vs KGP 2 | Anotar a lib e o erro exatos; subir SÓ essa lib para a menor versão que compile; documentar no relatório |
| `CMake`/`ninja`/`No space left on device` | disco | Reportar — o gate da Task 1 falhou em prever; usuário decide |
| Erro do AGP sobre compileSdk | aviso esperado virou erro | NÃO usar `suppressUnsupportedCompileSdk` sem reportar antes |

Cada correção: commit próprio (`build(mobile): <lib> <versão> — exigido pela migração RN 0.77`) e voltar ao Step 1.

---

### Task 5: Auditoria do artefato (N4.2 + alinhamento 16 KB) e entrega

**Files:** nenhum (auditoria é leitura; entrega é cópia).

**Interfaces:**
- Consumes: `.aab` da Task 4; `mapping.txt`/`usage.txt` de `app/android/app/build/outputs/mapping/release/`.
- Produces: veredito da auditoria + `~/Desktop/app-release-v6-rn077.aab`. Qualquer linha reprovada = task reprovada; investigar antes de entregar.

- [ ] **Step 1: Checklist N4.2**

```bash
A=$(mktemp -d) && cd "$A"
AAB=/Users/mateusnascimentonogueiradasilva/CalorIA/app/android/app/build/outputs/bundle/release/app-release.aab
unzip -q "$AAB"
M=/Users/mateusnascimentonogueiradasilva/CalorIA/app/android/app/build/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml
grep -o 'versionCode="[0-9]*"\|targetSdkVersion="[0-9]*"' "$M"          # esperado: 6 e 36
du -ch base/dex/*.dex | tail -1                                          # esperado: < 8MB
ls BUNDLE-METADATA/com.android.tools.build.obfuscation/                  # esperado: proguard.map
B=base/assets/index.android.bundle
strings -n 6 $B | grep -c ':3000'                                        # esperado: 0
strings -n 6 $B | grep -cE 'console\.(log|debug|info)'                   # esperado: 0
strings -n 6 $B | grep -c 'calor-ia-frontend.vercel.app'                 # esperado: 1+
strings -n 8 $B | grep -ciE 'sk-[a-zA-Z0-9]{20}|service_role'            # esperado: 0
```

- [ ] **Step 2: Alinhamento 16 KB — o motivo deste workstream**

```bash
R="$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf"
# fallback se o r27 não tiver o binário: usar o do r26 (leitor ELF é o mesmo)
[ -x "$R" ] || R="$ANDROID_HOME/ndk/26.1.10909125/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf"
for abi in arm64-v8a x86_64; do
  echo "== $abi =="
  for f in base/lib/$abi/*.so; do
    printf "  %-45s %s\n" "$(basename $f)" "$("$R" -l "$f" | awk '/LOAD/ {print $NF}' | sort -u | tr '\n' ' ')"
  done
done
```

Expected: **todas** as linhas com `0x4000` e nada mais. Qualquer `0x1000`: anotar a lib; se for do Fresco (`libimagepipeline`, `libnative-filters`, `libnative-imagetranscoder`), aplicar a mitigação da spec (override da versão do Fresco no `ext` do `build.gradle` raiz para a série 3.4+, rebuild, re-auditar); qualquer outra: investigar a origem antes de qualquer mudança.

- [ ] **Step 3: Sobrevivência ao R8**

```bash
MAP=/Users/mateusnascimentonogueiradasilva/CalorIA/app/android/app/build/outputs/mapping/release
grep -E "^com\.caloria\.(MainApplication|MainActivity) ->" $MAP/mapping.txt   # esperado: 2 linhas, nomes preservados
grep -c "^com.facebook.react.PackageList" $MAP/usage.txt || echo "0 (nao removido — ok)"  # esperado: 0
grep -cE "(ImagePickerModule|AsyncStorageModule|SafeAreaContextModule|ScreenViewManager) ->" $MAP/mapping.txt  # esperado: >= 4
```

- [ ] **Step 4: Entrega**

```bash
cp "$AAB" ~/Desktop/app-release-v6-rn077.aab
shasum -a 256 "$AAB" ~/Desktop/app-release-v6-rn077.aab   # esperado: hashes idênticos
cd / && rm -rf "$A"
```

---

### Task 6: Documentação

**Files:**
- Modify: `docs/mobile-hardening.md` (itens 6, 7 e 8)

**Interfaces:**
- Consumes: resultados das Tasks 4–5 (números reais da auditoria).
- Produces: registro permanente do desbloqueio; docs coerentes com o código.

- [ ] **Step 1: Item 8 — de bloqueador para resolvido**

Trocar o título `## 8. Páginas de 16 KB — bloqueia publicação, exige upgrade do React Native` por `## 8. Páginas de 16 KB — resolvido com a migração para RN 0.77.3 (Workstream O)` e acrescentar ao FINAL do item (mantendo a medição histórica como registro):

```markdown
**Resolução (2026-08-__):** migração para RN 0.77.3 + screens 4.x + NDK
27.1.12297006 + Kotlin 2.0.21 (Workstream O). Auditoria do `.aab` v6:
todas as libs de `arm64-v8a` e `x86_64` com segmentos LOAD em `0x4000`.
O comando de medição acima continua válido para auditar releases futuros.
```

(Preencher a data e, se alguma lib exigiu mitigação — ex.: override do Fresco —, registrar aqui.)

- [ ] **Step 2: Item 7 — corrigir a promessa sobre o aviso do AGP**

Trocar a frase `**O aviso é esperado e foi deixado à vista de propósito** — ele some quando o RN for atualizado para uma versão com AGP mais novo.` por:

```markdown
**O aviso é esperado e foi deixado à vista de propósito** — ele só some com
AGP ≥ 8.9 (o RN 0.77 traz AGP 8.7.x, então o aviso PERSISTE após o
Workstream O; deve sair num upgrade futuro do RN).
```

E conferir se o comentário equivalente em `app/android/build.gradle` (bloco do `compileSdkVersion`) precisa do mesmo ajuste — se sim, incluí-lo no commit.

- [ ] **Step 3: Item 6 — próximo versionCode**

Trocar `(atual: 3 — próximo upload usa 4)` (ou o valor que estiver) por `(atual: 6 — próximo upload usa 7)` na linha do versionCode.

- [ ] **Step 4: Commit**

```bash
cd /Users/mateusnascimentonogueiradasilva/CalorIA
git add docs/mobile-hardening.md app/android/build.gradle
git commit -m "docs: item 8 resolvido (RN 0.77.3 / 16 KB) + notas de AGP e versionCode"
```

---

## Handoff final (fora das tasks — decisões do usuário)

1. **Upload:** `~/Desktop/app-release-v6-rn077.aab` no Play Console. Se acusar versionCode usado: conferir Explorador de pacotes de apps e gerar com `-PcaloriaVersionCode=7`.
2. **Smoke test em device continua obrigatório antes de promover para produção** — e mais importante do que nunca: a camada nativa inteira mudou (RN 0.77, screens 4, NDK 27, Kotlin 2). Roteiro: itens 6 e 7 do mobile-hardening (abertura a frio → login → dashboard → refeição → scanner → deep link → logout + passada visual de edge-to-edge).
3. **Merge da branch `feat/rn077-16kb`** em `main` após o upload passar (ou antes, a critério do usuário).
