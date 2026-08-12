# Spec — Migração React Native 0.77 para páginas de 16 KB (Workstream O)

**Data:** 2026-08-12
**Origem:** Play Console recusou o `.aab` v5: *"Seu app não é compatível com tamanhos de página de 16 KB de memória"*. Diagnóstico completo no item 8 do [mobile-hardening.md](../../mobile-hardening.md).
**Status:** Design aprovado, pronto para plano de implementação.

## 1. Objetivo

Destravar a publicação na Play Store migrando o app de React Native 0.76.9 para **0.77.3**, a menor mudança que faz todas as bibliotecas nativas do `.aab` saírem com segmentos ELF alinhados a 16 KB (`0x4000`), preservando todo o hardening dos Workstreams N e seguintes (R8, remoção de console, fail-fast de URL, targetSdk 36).

## 2. Diagnóstico e prova do alvo

### O problema (medido, não inferido)

As 13 libs nativas do `.aab` v5 têm segmentos `LOAD` em `0x1000` (4 KB). Destas:

- **9 vêm prontas dentro de AARs** (`libreactnative`, `libhermes`, `libhermestooling`, `libjsi`, `libfbjni`, `libc++_shared` + 3 do Fresco) — o `libreactnative.so` de `react-android-0.76.9-release.aar` já sai desalinhado da origem. Nenhuma configuração local altera binário pré-compilado.
- **4 são compiladas aqui** (`libappmodules`, `librnscreens`, `libreact_codegen_rnscreens`, `libreact_codegen_safeareacontext`) — essas o NDK r27 resolve.

### A prova de que 0.77.3 resolve (medição de 2026-08-12)

AARs baixados do Maven Central e medidos com `llvm-readelf` **antes** de qualquer migração:

- `react-android-0.77.3-release.aar` → todas as 7 libs arm64 (`libreactnative`, `libhermes`, `libhermestooling`, `libjsctooling`, `libjsi`, `libfbjni`, `libc++_shared`) em **0x4000** ✓
- `hermes-android-0.77.3-release.aar` → `libhermes.so` em **0x4000** ✓

As 3 libs do Fresco não foram pré-auditadas (vêm de AARs do Fresco que o RN puxa transitivamente) — a auditoria final do artefato cobre; mitigação registrada nos riscos.

### O que o template 0.76.9 → 0.77.3 muda (diff oficial do rn-diff-purge)

- `ndkVersion`: `26.1.10909125` → **`27.1.12297006`** (alinha as 4 libs locais)
- `kotlinVersion`: `1.9.25` → **`2.0.21`**
- `package.json`: `react-native` e `@react-native/*` → 0.77.3
- **Nada mais no Android**: Gradle (8.10.2), buildTools, compileSdk/targetSdk, `gradle.properties`, manifest, `MainActivity.kt`/`MainApplication.kt` ficam como estão. (As mudanças de template iOS — AppDelegate Swift — estão fora de escopo, ver §6.)

## 3. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DO1 | Versão-alvo | **0.77.3** (última patch da série). É o menor delta que resolve o bloqueador e **mantém React 18.3.1** (peer `^18.2.0` verificado no npm) — o build web (react-native-web 0.19 / Vercel) fica intocado. RN 0.78+ traz React 19: risco novo sem ganho para este objetivo |
| DO2 | Prova antes da migração | Gate de entrada **já cumprido**: os AARs do 0.77.3 foram baixados e medidos (§2). Não se migra na esperança — migra-se com a causa raiz comprovadamente corrigida no alvo |
| DO3 | Escopo de plataforma | **Android + JS.** O projeto iOS nunca foi buildado neste repositório (pods nunca instalados — item 3 do mobile-hardening); a migração do AppDelegate para Swift do template 0.77 fica documentada como pendência, não executada |
| DO4 | Bibliotecas nativas | `react-native-screens` **3.35 → 4.13.1 (pin exato)**. Obrigatório: a tabela Fabric oficial exige 4.5.0+ para RN 0.77 — a 3.x não tem suporte. O pin em 4.13.1 (e não `^4.5.0`) é deliberado: a janela compatível é 4.5–4.13, pois **4.14.0+ exige RN 0.79** e um range caret resolveria para 4.26+ (RN 0.84+). `safe-area-context` 4.14, `image-picker` 8.2 e `async-storage` 2.2 **mantidos** — só sobem se o build quebrar. AsyncStorage 3.x NÃO entra: o Kotlin 2 até libera, mas a API é idêntica (YAGNI) |
| DO5 | Toolchain | Exatamente o do template 0.77.3: NDK `27.1.12297006`, Kotlin `2.0.21`. **Não mudam**: compileSdk/targetSdk 36, buildTools 35.0.0, Gradle 8.10.2, `newArchEnabled=true`, Hermes |
| DO6 | Hardening preservado | R8 + shrinkResources, remoção de console, fail-fast de `API_BASE_URL` (runtime + task `verifyReleaseApiBaseUrl`), keep rules mínimas — tudo fica. A auditoria final repete o checklist N4.2 **e acrescenta** o alinhamento 0x4000 de todas as libs nas ABIs 64-bit (`arm64-v8a`, `x86_64` — o requisito de 16 KB é de 64-bit) |
| DO7 | versionCode | Default **6** (o 5 foi consumido: o Play leu o bundle v5 para acusar o 16 KB). Override `-PcaloriaVersionCode=N` continua valendo |
| DO8 | Disco | **Gate duro: ≥ 10 GB livres** antes do primeiro build. Medição de 2026-08-12: 585 MB livres (97% de uso) — insuficiente. O NDK 27 (~2–4 GB) é baixado na primeira build, mais npm install e ~1,5 GB de intermediários do Gradle. Liberar espaço é decisão do usuário (maiores candidatos: `~/Downloads` 32 GB, caches do Gradle 5 GB) |
| DO9 | Runtime | O smoke test manual (itens 6–7 do mobile-hardening) continua sendo o gate final e fica **mais crítico**: a camada nativa inteira muda. A verificação estática de sobrevivência ao R8 (entry points, autolinking, módulos nativos) é repetida no artefato novo |

## 4. Requisitos

### O1 — Pré-flight

- **O1.1** Disco com ≥ 10 GB livres (`df -h /`). Menos que isso: **parar e devolver ao usuário** — nenhuma task de build roda.
- **O1.2** Branch dedicada a partir de `main` atualizada, incorporando a branch `docs/bloqueador-16kb` (item 8 do mobile-hardening vive só nela).
- **O1.3** `app/.env` com `API_BASE_URL` https de produção (a guarda de build falha sem isso — comportamento correto).

### O2 — Bumps JS

- **O2.1** `react-native@0.77.3` (exato), `@react-native/babel-preset|eslint-config|metro-config|typescript-config@^0.77.3`, `@react-native-community/cli@^16.0.0`, `react-native-screens@4.13.1` (pin exato — ver DO4).
- **O2.2** `react@18.3.1`, `react-test-renderer@18.3.1`, `react-native-web@^0.19.13` **inalterados**.
- **O2.3** Baseline jest preservada: as mesmas 6 suítes / 11 testes que já falham em `main` (OnboardingOptionCard, LoginScreen, RegisterScreen, DashboardScreen, DietProgressHeader, MealPlanCard) e **zero falhas novas** (hoje: 11 failed / 227 passed / 238 total).
- **O2.4** `npm run build:web` compila (o webpack usa o mesmo `babel.config.js`, então o preset 0.77 também passa pelo caminho web).

### O3 — Toolchain Android

- **O3.1** `ndkVersion = "27.1.12297006"` e `kotlinVersion = "2.0.21"` em `app/android/build.gradle`.
- **O3.2** O comentário atual sobre Kotlin 1.9.x (que cita a trava do RN 0.76 e do AsyncStorage) fica obsoleto — substituir por um que registre o estado novo.
- **O3.3** `versionCode` default 5 → 6.

### O4 — Build de release

- **O4.1** `./gradlew clean bundleRelease` verde, com R8 e a guarda `verifyReleaseApiBaseUrl` executando. Primeira build baixa o NDK 27 automaticamente (licenças já aceitas).
- **O4.2** Falhas de compilação são investigadas e documentadas — **nunca** contornadas com keep rules ou flags às cegas.

### O5 — Auditoria do artefato

- **O5.1** Checklist N4.2 completo: `versionCode="6"`, `targetSdkVersion="36"`, dex < 8 MB, `proguard.map` embutido, 0 URLs de dev, 0 `console.(log|debug|info)`, URL de produção presente, 0 segredos.
- **O5.2** **Novo:** todas as `.so` de `base/lib/arm64-v8a` e `base/lib/x86_64` com segmentos `LOAD` em `0x4000`. Uma única lib em `0x1000` = auditoria reprovada.
- **O5.3** Verificação estática de R8: `MainActivity`/`MainApplication` com nomes preservados no mapping; `PackageList` presente (renomeado ok, removido não); módulos nativos das 4 libs autolinkadas presentes.
- **O5.4** Entrega em `~/Desktop/app-release-v6-rn077.aab` com SHA-256 conferido.

### O6 — Documentação

- **O6.1** Item 8 do mobile-hardening: de "bloqueia publicação" para resolvido (RN 0.77.3, data, medição do artefato final).
- **O6.2** Item 7: corrigir a nota do AGP — o aviso `tested up to compileSdk = 35` **não** some com o RN 0.77 (que traz AGP 8.7.x); some apenas com AGP ≥ 8.9 (RN mais novo). A frase atual promete o contrário.
- **O6.3** Item 6: próximo versionCode = 7.

## 5. Critérios de aceite

1. Upload do `.aab` v6 no Play Console **sem** o erro de 16 KB — e sem regressão dos anteriores (versão vazia, target API).
2. Auditoria O5 integralmente verde, incluindo `0x4000` em todas as libs 64-bit.
3. `bundleRelease` verde com R8 ativo e guarda de env executada.
4. Jest: mesmas 11 falhas preexistentes, zero novas; `build:web` compila.
5. Docs do item O6 atualizados.
6. Backend (vitest) intocado.

## 6. Fora de escopo

Build/migração iOS (pods, AppDelegate Swift do template 0.77), React 19 / RN 0.78+, AsyncStorage 3.x, react-navigation v7, correções de edge-to-edge (só sob evidência do smoke test), automação de emulador, limpeza do disco do usuário (decisão dele — o gate O1.1 apenas verifica).

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Libs do Fresco (3 de 13) seguirem em 4 KB no artefato final | Auditoria O5.2 pega. Mitigação: sobrescrever a versão do Fresco via `ext` no `build.gradle` raiz para uma série 3.4+ (alinhada) e rebuildar |
| screens 3.x → 4.x mudar comportamento de navegação (headers, gestos, modais) | Combinação navigation v6 + screens 4.x é suportada oficialmente; diferenças visuais/comportamentais só aparecem no smoke test manual — que já é gate obrigatório |
| Kotlin 2.0.21 quebrar compilação de alguma lib nativa | As 4 libs autolinkadas nas versões atuais compilam com KGP 2.x (async-storage 2.2 só ativa KSP com `useNextStorage=true`, default off). O build (O4) é o detector; falha → investigar versão da lib, não silenciar |
| Preset jest/babel 0.77 alterar a baseline de testes | Comparação por suíte contra a lista nominal de O2.3; só falhas novas são investigadas |
| Disco insuficiente no meio do build (NDK 27 ~2–4 GB) | Gate O1.1 (≥ 10 GB) antes de qualquer task de build |
| R8 sobre código nativo novo (screens 4, RN 0.77) remover classe usada por reflection | Verificação estática O5.3 + smoke test manual; keep rule só com `ClassNotFoundException`/`NoSuchMethodError` nominal no logcat |
