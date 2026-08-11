# Spec — Otimização e hardening do bundle Android (Workstream N)

**Data:** 2026-08-10
**Origem:** Play Console acusando "Otimização do app: Baixa" (ofuscação 2%, sem redução, sem config R8) no upload do `.aab`. Pedido de auditoria de vulnerabilidades no bundle.
**Status:** Design aprovado, pronto para plano de implementação.

## 1. Objetivo

Fazer o `.aab` de release passar limpo pela análise do Play Console (R8 ativo, código ofuscado e reduzido) e eliminar os achados da auditoria de segurança do bundle, sem quebrar o app em runtime — R8 é a mudança de maior risco porque remove/renomeia classes que bibliotecas nativas podem acessar por reflection.

## 2. Auditoria realizada (2026-08-10)

Artefato auditado: `app-release.aab` (versionCode 2, 37MB), extraído e inspecionado.

### O que está saudável ✅

| Item | Evidência |
|---|---|
| Sem segredos no bundle | 0 ocorrências de chave de API (`sk-…`), `service_role` ou congêneres no bytecode Hermes |
| URL de produção correta | `https://calor-ia-frontend.vercel.app/api` embutida; https obrigatório |
| Manifest sem `debuggable` | ausente do manifest compilado |
| Sem exceção de cleartext | `usesCleartextTraffic` ausente (Android 9+ bloqueia http por padrão) |
| `allowBackup=false` | tokens não vazam por backup ADB/cloud |
| Só a MainActivity exportada | launcher + deep link `caloria://`, nada mais |
| Hermes ativo | JS é bytecode (v96), não fonte legível |
| Assinatura de release | keystore `caloria-upload`, não debug |

### Achados a corrigir ⚠️

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| A1 | **R8 desligado** — `enableProguardInReleaseBuilds = false` em [build.gradle:60](../../../app/android/app/build.gradle) | 11,4MB de dex sem minificar/ofuscar; é a causa direta do aviso do Play Console | Alta (é o bloqueio reportado) |
| A2 | **`shrinkResources` ausente** — recursos não usados entram no pacote | sem flag no buildType release | Média |
| A3 | **Fallbacks de dev alcançáveis em release** — `http://10.0.2.2:3000` e `http://localhost:3000` no bundle; se o `.env` faltar no build, o release aponta para localhost silenciosamente | strings presentes no bytecode Hermes | Média |
| A4 | **`console.*` não removido em release** — logs viáveis via logcat em device de usuário; risco de vazar dado pessoal em log futuro + custo de performance | referências a `console` no bytecode | Baixa/Média |

### Dívidas já documentadas (fora de escopo aqui)

Tokens em AsyncStorage sem Keychain e ausência de crash reporting já estão registrados em [mobile-hardening.md](../../mobile-hardening.md) (itens 1 e 2) — não são achados novos deste workstream.

## 3. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DN1 | Minificação | **R8 ativo** no release: `minifyEnabled true` + `shrinkResources true`. As bibliotecas RN modernas trazem consumer rules nos AARs; keep rules manuais só para Hermes/JNI |
| DN2 | Validação do R8 | **Smoke test de release obrigatório** antes de qualquer upload: R8 quebra em runtime (reflection), não em build. Login, dashboard, registro de refeição, scanner e deep link |
| DN3 | Mapping de desofuscação | O AGP moderno **embute o `mapping.txt` no próprio `.aab`** (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`) — verificar presença na auditoria do artefato; sem upload separado no Play |
| DN4 | Logs em release | `babel-plugin-transform-remove-console` no env `production` do Babel, **preservando `error` e `warn`** (o `AppErrorBoundary` depende de `console.error` para diagnóstico local) |
| DN5 | Fallback de URL | Fallbacks `10.0.2.2`/`localhost` só quando `__DEV__`; **release sem `API_BASE_URL` lança erro na inicialização** (fail-fast explícito em vez de apontar para localhost). Bônus: o Metro inlineia `__DEV__=false` e o terser elimina o branch morto — as strings de dev saem do bundle |
| DN6 | versionCode | Continua **manual e incrementado a cada upload** (próximo: 3). Automação (derivar de commit/CI) fica fora de escopo — YAGNI enquanto o build for local |
| DN7 | Manifest | **Sem mudanças** — auditoria não encontrou problema |

## 4. Requisitos

### N1 — Fail-fast de URL em release (A3)

- **N1.1** `resolveBaseUrl` em [api.ts](../../../app/src/shared/services/api.ts) retorna fallback de dev **apenas sob `__DEV__`**; em release sem `envUrl` lança `Error` com mensagem acionável.
- **N1.2** Testes: fallback continua funcionando em dev (baseline atual); com `__DEV__=false` e sem env, lança.

### N2 — Remoção de console em release (A4)

- **N2.1** Bloco `env.production` no [babel.config.js](../../../app/babel.config.js) com `transform-remove-console`, `exclude: ['error', 'warn']`.
- **N2.2** Verificação: bundle gerado com `--dev false` não contém `console.log` (o Metro usa env `production` quando `dev=false`).
- **N2.3** Baseline jest preservada (o plugin não roda no env de teste).

### N3 — R8 + shrinkResources (A1, A2)

- **N3.1** `enableProguardInReleaseBuilds = true` e `shrinkResources true` no release.
- **N3.2** Keep rules em `proguard-rules.pro`: Hermes (`com.facebook.hermes.unicode.**`) e JNI (`com.facebook.jni.**`). Nada além do necessário — consumer rules dos AARs cobrem o resto; regra nova só se o smoke test quebrar.
- **N3.3** `./gradlew bundleRelease` verde e mapping embutido no `.aab`.

### N4 — Artefato final auditado

- **N4.1** `versionCode 3`, rebuild completo.
- **N4.2** Auditoria do `.aab` final (checklist objetivo):
  - dex total **substancialmente menor** que os 11,4MB atuais;
  - `proguard.map` presente no `BUNDLE-METADATA`;
  - **0** ocorrências de `localhost` / `10.0.2.2` no bytecode;
  - **0** `console.log` (error/warn podem restar);
  - URL de produção https presente; **0** segredos.

### N5 — Smoke test de release (DN2)

- **N5.1** App release instalado em emulador/device (`run-android --mode release`).
- **N5.2** Roteiro mínimo: abrir app → login → dashboard com anel de calorias → registrar refeição → abrir scanner (picker de imagem) → deep link `caloria://` → logout.
- **N5.3** Qualquer crash: diagnosticar por logcat, adicionar keep rule pontual, rebuild, repetir o roteiro.

### N6 — Documentação

- **N6.1** Atualizar seção 6 de [mobile-hardening.md](../../mobile-hardening.md): R8 ativo, mapping embutido, smoke test obrigatório pré-upload, próximo versionCode.

## 5. Critérios de aceite

1. Próximo upload no Play Console **sem** o aviso "Otimização do app: Baixa" (porcentagens de ofuscação/redução preenchidas).
2. Checklist N4.2 integralmente verde no artefato enviado.
3. Roteiro N5.2 completo sem crash no build de release.
4. Baselines de teste do app (jest) e do backend (vitest) preservadas.
5. `docs/mobile-hardening.md` reflete o novo processo de release.

## 6. Fora de escopo

Keychain para tokens e Sentry/Crashlytics (dívidas já documentadas), Universal/App Links, automação de `versionCode`, Play App Signing, otimização de imagens/assets, baseline profiles.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| R8 remove classe usada por reflection → crash só em runtime | Smoke test obrigatório (N5) antes de todo upload; keep rules pontuais guiadas pelo logcat |
| `shrinkResources` remover recurso referenciado dinamicamente | Mesmo smoke test cobre; recursos do app são referenciados estaticamente (React Native usa poucos recursos Android nativos) |
| Remoção de console mascarar erro em produção | `error`/`warn` preservados (DN4); crash reporting continua como dívida documentada |
| Fail-fast de URL derrubar build de dev sem `.env` | Comportamento de dev inalterado (fallback continua sob `__DEV__`); o `.env` já era obrigatório para o bundle compilar |
