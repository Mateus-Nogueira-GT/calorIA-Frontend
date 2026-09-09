# Spec — Correções Android/iOS + desbloqueio da review da Apple

**Data:** 2026-09-08
**Origem:** sessão de debug guiada pela skill `mattpocock-skills:diagnosing-bugs` (clone de `mattpocock/skills`), executada em `app/` sobre `main` (`f643cce`).
**Plano de implementação:** `docs/superpowers/plans/2026-09-08-android-ios-review-apple.md`
**Spec anterior (contexto):** `docs/spec-bugs-pos-lancamento.md` — os bugs A1–A6, B1–B4 e M1–M8 de lá foram conferidos e **estão corrigidos**; nada aqui os repete.

---

## 0. Feedback loop desta sessão (Fase 1 da skill)

A skill exige um comando único, já executado, capaz de ficar vermelho no bug e verde na correção.
Nesta máquina **não há Android SDK (`adb` ausente) nem Xcode** (só Command Line Tools), então
o loop nativo de build/instalação não existe aqui. O que existe e foi usado:

| # | Comando | Estado hoje | Cobre |
|---|---------|-------------|-------|
| L1 | `cd app && ./node_modules/.bin/tsc --noEmit` | 🔴 **27 erros** | X1, X3, N3-adjacentes, I-nenhum |
| L2 | `cd app && ./node_modules/.bin/jest` | 🔴 **2 suítes / 4 testes** | X2 |
| L3 | `cd app && npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/and.jsbundle` | 🟢 exit 0, 1.57 MB | garante que o caminho de release do JS não regrediu |
| L4 | `cd app && ./node_modules/.bin/jest src/features/auth/screens/ProfileSetupScreen.test.tsx` | 🔴 **R1** (após adicionar o caso de regressão) | R1 — payload com `NaN`; 1,07 s, determinístico |

**Limite declarado (exigência da skill):** os achados marcados `⚠️ APARELHO` abaixo **não têm loop
automatizável nesta máquina**. Foram verificados estaticamente contra o código do repositório e o
código-fonte das libs em `node_modules`, mas o veredito final depende de rodar em aparelho/emulador.
O plano transforma cada um deles num passo de verificação manual explícito, com o comando exato.

**Baseline importante:** `npm install` precisou ser rodado — o repositório estava sem `node_modules`.
Antes disso, nem `tsc` nem `jest` rodavam. Isso é sintoma do achado **X4**.

---

## 1. A rejeição da Apple — causa e correção

> *"An automated analysis of the submission indicates the app may include a login but was
> submitted without a demo account."*

### 1.1 Por que aconteceu

**Não é bug de código. É metadado de submissão faltando.** A análise automatizada está certa:
o CalorIA **é 100% fechado atrás de login**, sem nenhum modo convidado.

Cadeia verificada:

- `app/src/navigation/RootNavigator.tsx:111-142` — `RootNavigator` renderiza `AuthNavigator`
  sempre que `showAuthenticatedApp` é falso. Não há terceira via.
- `app/src/navigation/RootNavigator.tsx:53-68` — `isAppPreviewEnabled()` (o bypass `?preview=app`)
  retorna `false` quando `!__DEV__` **e** quando `Platform.OS !== 'web'`. Ou seja: no binário iOS
  de release ele é morto por dois motivos independentes. Correto por segurança — e é justamente
  por isso que o revisor não tem como entrar.
- `app/src/features/auth/screens/{LoginScreen,RegisterScreen}.tsx` — campos de e-mail e senha
  (`secureTextEntry`), que é o padrão que o scanner estático da Apple detecta no binário.
- O campo **App Review Information → Sign-In Required → Demo Account** no App Store Connect
  ficou vazio na submissão.

**Login social não é atenuante nem agravante:** `@react-native-google-signin/google-signin` e
`@invertase/react-native-apple-authentication` **não estão em `package.json` nem instalados**
(`ls node_modules/@invertase` → não existe). Logo `isGoogleSignInAvailable` e
`isAppleSignInAvailable` são `false` (`app/src/shared/services/{google,apple}-signin.service.ts`)
e os botões ficam ocultos. Consequência prática: o binário submetido só tem login por
e-mail/senha, então **a Guideline 4.8 (obrigatoriedade de Sign in with Apple) não se aplica** —
não há login de terceiro para acompanhar. Um dia que se instale o Google Sign-In, a Apple passa a
exigir o Sign in with Apple junto.

### 1.2 O que destrava (ação no App Store Connect, não no código)

Preencher **App Review Information** com uma conta demo funcional e responder à mensagem.
Cadastro serve de imediato porque o backend **autoconfirma o e-mail**
(`backend/src/modules/auth/auth.service.ts:34` → `email_confirm: true`), então não há link de
confirmação para o revisor perseguir.

### 1.3 Os riscos de código que precisam ir junto

Só preencher o campo resolve *esta* rejeição e deixa três armadilhas de pé para a próxima:

- **AP1 — o revisor pode destruir a conta demo.** `ProfileScreen.tsx:125-129` expõe
  "🗑️ Excluir conta", que chama `users.routes.ts:138` → `deleteUserAccount` →
  `supabase.auth.admin.deleteUser` (`users.service.ts:157`): **hard delete**. Se o revisor tocar
  ali (e revisores testam exatamente esse fluxo, porque a 5.1.1(v) o exige), a credencial
  entregue à Apple morre e a submissão seguinte é rejeitada por "demo account does not work".
- **AP2 — conta demo vazia não demonstra o app.** Uma conta recém-criada cai no
  `ProfileSetupScreen` e chega ao dashboard sem dieta, sem diário, sem desafios e sem feed. O
  revisor precisa ver o app funcionando, não um shell vazio.
- **AP3 — a fila de achados de privacidade (I1, I2, I3) continua ativa** e volta como
  rejeição/aviso na próxima rodada.

---

## 2. Achados iOS

| ID | Sev. | Estado | Achado |
|---|---|---|---|
| I1 | ALTA | ✅ VERIFICADO | `PrivacyInfo.xcprivacy` **não entra no bundle** |
| I2 | ALTA | ✅ VERIFICADO | `NSPrivacyCollectedDataTypes` vazio contradiz o que o app coleta |
| I3 | ALTA | ✅ VERIFICADO | `NSLocationWhenInUseUsageDescription` é string vazia |
| I4 | MÉDIA | ✅ VERIFICADO | Launch screen ainda diz "Powered by React Native" |
| I5 | MÉDIA | ⚠️ APARELHO | Splash preta em dark mode num app só-claro |
| I6 | BAIXA | ✅ VERIFICADO | Nome do app é "calorIA" (c minúsculo) |

### I1 — ALTA — `PrivacyInfo.xcprivacy` existe mas não é copiado para o `.app`

- **Onde:** `app/ios/calorIA.xcodeproj/project.pbxproj`
- **Evidência:** o arquivo aparece em exatamente duas linhas — `49` (`PBXFileReference`) e `111`
  (membro do grupo). Não existe nenhum `PBXBuildFile` para ele, e nenhuma das duas
  `PBXResourcesBuildPhase` (`00E356EC…` do target de testes e `13B07F8E…` do app) o lista. As duas
  fases contêm só `LaunchScreen.storyboard`, `Images.xcassets` e as 5 fontes Inter.
- **Consequência:** o manifesto de privacidade **não vai dentro do `.ipa`**. A Apple responde com
  ITMS-91053 ("Missing API declaration") por e-mail após o upload. Os pods do RN trazem os
  manifestos deles, mas o do target do app — que é o que o arquivo se propõe a ser — está sendo
  descartado em silêncio.
- **Correção:** adicionar o `PBXBuildFile` e incluí-lo na `PBXResourcesBuildPhase` do target `calorIA`.
- **Teste:** `unzip -l` no `.ipa` (ou `ls` no `.app`) mostra `PrivacyInfo.xcprivacy`.

### I2 — ALTA — `NSPrivacyCollectedDataTypes` declara coleta zero

- **Onde:** `app/ios/calorIA/PrivacyInfo.xcprivacy` → `<key>NSPrivacyCollectedDataTypes</key><array/>`
- **Causa:** array vazio significa "este app não coleta nada". O app coleta, no mínimo: e-mail e
  nome (cadastro), identificador de usuário, dados de saúde/fitness (peso, altura, objetivo,
  calorias), fotos (scanner de pratos, `includeBase64: true` sobe a imagem) e conteúdo do usuário
  (posts e comentários do feed).
- **Consequência:** contradiz as respostas de App Privacy no App Store Connect. Divergência entre
  manifesto e ficha é motivo de rejeição sob a 5.1.1/5.1.2 e não é pega por validação automática.
- **Correção:** preencher `NSPrivacyCollectedDataTypes` e alinhar com as respostas do ASC.

### I3 — ALTA — purpose string de localização vazia, para uma permissão que o app não usa

- **Onde:** `app/ios/calorIA/Info.plist` → `<key>NSLocationWhenInUseUsageDescription</key><string/>`
- **Evidência de que é morta:** `grep -rn "Geolocation" app/src` não retorna nada fora de
  `location` de `window.location` em testes. Nenhuma lib de geolocalização em `package.json`.
- **Consequência:** purpose string presente e vazia é tratada como ausente pela validação da Apple
  (família ITMS-90683) e, quando passa, vira pedido de justificativa na review.
- **Correção:** remover a chave inteira.

### I4 — MÉDIA — launch screen é a do template do React Native

- **Onde:** `app/ios/calorIA/LaunchScreen.storyboard`
- **Causa:** os dois labels do template continuam lá: `text="calorIA"` e
  `text="Powered by React Native"`.
- **Usuário/revisor vê:** ao abrir o app, uma tela branca com "calorIA" e "Powered by React
  Native" embaixo. Não bate com a identidade da ficha da loja.
- **Correção:** substituir pelo ícone/wordmark do CalorIA sobre `colors.brandBackground` (`#FAF8F4`).

### I5 — MÉDIA — ⚠️ APARELHO — splash preta em dark mode

- **Onde:** `LaunchScreen.storyboard` (`<color key="backgroundColor" systemColor="systemBackgroundColor"…>`)
  · `Info.plist` (sem `UIUserInterfaceStyle`)
- **Causa:** `systemBackgroundColor` é branco no claro e **preto no escuro**. Sem
  `UIUserInterfaceStyle`, o app segue o sistema. A paleta JS (`app/src/theme/colors.ts`) é
  fixa e clara — `brandBackground: '#FAF8F4'`.
- **Usuário vê (a confirmar em aparelho):** com o iPhone em modo escuro, splash preta → app claro.
  Alerts, teclado e seleção de texto também renderizam escuros dentro de uma UI clara.
- **Correção:** `UIUserInterfaceStyle = Light` no `Info.plist` + cor fixa na storyboard. (Dark mode
  de verdade é escopo próprio, não entra aqui.)

### I6 — BAIXA — nome do app em minúsculo

- **Onde:** `Info.plist` (`CFBundleDisplayName = calorIA`) · `app/app.json` (`displayName`)
- **Correção:** "CalorIA", igual à ficha da loja.

---

## 3. Achados Android

| ID | Sev. | Estado | Achado |
|---|---|---|---|
| N1 | ALTA | ⚠️ APARELHO | Tema nativo DayNight sobre uma UI só-clara |
| N2 | ALTA | ⚠️ APARELHO | R8 ligado com keep rules mínimas e libs sem consumer rules |
| N3 | MÉDIA | ⚠️ APARELHO | `KeyboardAvoidingView behavior="height"` + `adjustResize` |
| N4 | MÉDIA | ✅ VERIFICADO | Nenhum tratamento de botão voltar do Android |
| N5 | BAIXA | ✅ VERIFICADO | `app_name` em minúsculo |

### N1 — ALTA — ⚠️ APARELHO — tema nativo segue o dark mode, a UI não

- **Onde:** `app/android/app/src/main/res/values/styles.xml` ·
  `app/src/theme/colors.ts` · ausência de `res/values-night/`
- **Causa:** `AppTheme` herda de `Theme.AppCompat.DayNight.NoActionBar`. Em modo escuro o
  AppCompat troca `android:windowBackground` e as cores dos widgets nativos para a variante dark.
  A paleta do app é 100% clara e não há `values-night` para compensar. Confirmado: `grep` por
  `useColorScheme`/`Appearance` em `src/theme/` não retorna nada.
- **Usuário vê (a confirmar em aparelho com o sistema em escuro):** fundo escuro atrás do app
  (flash na abertura, durante transições de navegação e no resize do teclado), diálogos de
  `Alert.alert` escuros no meio de uma UI clara, cursor e alças de seleção do `TextInput` com
  cores de dark mode sobre campos claros.
- **Correção:** trocar o parent para `Theme.AppCompat.Light.NoActionBar` e fixar
  `android:windowBackground` em `#FAF8F4` (mesma decisão do I5: o app é claro por design).
- **Teste:** aparelho/emulador em modo escuro → abrir o app, abrir um `Alert`, focar um campo.

### N2 — ALTA — ⚠️ APARELHO — R8 ligado, keep rules mínimas, libs sem consumer rules

- **Onde:** `app/android/app/build.gradle:64` (`enableProguardInReleaseBuilds = true`) ·
  `app/android/app/proguard-rules.pro`
- **Causa:** o `proguard-rules.pro` mantém só `com.facebook.hermes.unicode.**` e
  `com.facebook.jni.**`, e o próprio comentário do arquivo registra que as libs autolinkadas não
  trazem regras próprias. Verificado: nenhuma das quatro (`react-native-image-picker`,
  `react-native-screens`, `react-native-safe-area-context`,
  `@react-native-async-storage/async-storage`) tem arquivo `proguard`/`consumer-rules.pro` em
  `node_modules`. As regras genéricas do AAR do `react-android` (`@DoNotStrip`,
  `implements NativeModule`, `native <methods>`) são a única proteção.
- **Consequência:** R8 quebra **em runtime, nunca no build** — um `.aab` que compila limpo pode
  crashar no aparelho. Não há registro de smoke test de release após o upgrade para RN 0.85.3
  (commits `8d8ad65`/`8a39c45`).
- **Correção:** não mexer nas regras às cegas. **Executar o smoke test de release**
  (`docs/mobile-hardening.md` §6) num `.aab`/APK assinado e só adicionar keep rule se algo
  crashar, com o stack trace do `adb logcat` como justificativa.

### N3 — MÉDIA — ⚠️ APARELHO — dupla compensação de teclado no onboarding

- **Onde:** `app/src/features/auth/screens/ProfileSetupScreen.tsx:152` ·
  `app/android/app/src/main/AndroidManifest.xml:20` (`windowSoftInputMode="adjustResize"`)
- **Causa:** `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. No Android, `adjustResize`
  já encolhe a janela quando o teclado sobe; o `behavior="height"` do `KeyboardAvoidingView`
  encolhe **de novo**, em cima do resize que já aconteceu.
  As outras quatro telas do app usam `behavior={... : undefined}` — que é o par correto do
  `adjustResize` (`LoginScreen.tsx:116`, `RegisterScreen.tsx:129`,
  `PostCommentsScreen.tsx:46`, `AddMealModal.tsx:103`). O onboarding é o ponto fora da curva.
- **Usuário vê (a confirmar):** ao focar um campo no cadastro do perfil, o conteúdo salta/encolhe
  além do necessário; em telas pequenas o botão de avançar pode sumir.
- **Correção:** alinhar com as outras telas (`undefined` no Android).

### N4 — MÉDIA — ✅ VERIFICADO — botão voltar do Android não é tratado em lugar nenhum

- **Onde:** o app inteiro — `grep -rn "BackHandler" app/src` retorna vazio.
- **Consequência:** onde o React Navigation cuida sozinho (stacks), funciona. Onde não cuida, o
  voltar do sistema faz a coisa errada: o `Scanner` é aberto com `presentation: 'modal'`
  (`RootNavigator.tsx:135`) e o fluxo de scan tem estado intermediário; formulários com dados não
  salvos (`CreatePostScreen`, `CreateChallengeScreen`, `ProfileEditScreen`) descartam sem
  confirmar. Não há tela de saída do app com confirmação.
- **Correção:** decidir tela a tela. Mínimo: confirmação de descarte nos formulários com conteúdo
  digitado. (Escopo a fechar com o cliente — ver §6.)

### N5 — BAIXA — nome do app em minúsculo

- **Onde:** `app/android/app/src/main/res/values/strings.xml` → `app_name = calorIA`
- **Correção:** "CalorIA", junto com I6.

### Verificados e OK no Android (não são bugs — registrado para não reinvestigar)

- `android:usesCleartextTraffic="${usesCleartextTraffic}"` **não** é placeholder órfão: o
  `react-native-gradle-plugin` injeta o valor por build type
  (`AgpConfiguratorUtils.kt:39-45` → debug `true`, release `false`).
- Permissão de câmera em runtime está correta e documentada
  (`image-picker.service.ts:19-28`), incluindo a regra do `react-native-image-picker` de que
  declarar `CAMERA` no manifest obriga o request manual (README da lib, linha 51).
- Deep link `caloria://` tem intent-filter no manifest e handler no `AppDelegate.mm` (iOS).
- `targetSdk 36`, `ndkVersion 27.1.12297006` (páginas de 16 KB), `kotlinVersion 2.1.20`,
  assinatura de release fora do repo e o guard `verifyReleaseApiBaseUrl` estão todos corretos.

---

## 4. Achados cross-platform

### X1 — ALTA — ✅ VERIFICADO — `type-check` vermelho: 27 erros

`cd app && ./node_modules/.bin/tsc --noEmit` → 27 erros (8 em código de produção, 19 em testes).
Os 8 de produção:

| Arquivo:linha | Erro | Impacto real |
|---|---|---|
| `src/features/profile/screens/ProfileGoalsScreen.tsx:64` | `variant="heading3"` não existe | **bug visível — ver X1a** |
| `src/features/profile/screens/ProfileCoachPersonalityScreen.tsx:66` | idem | **bug visível — ver X1a** |
| `src/navigation/TabNavigator.next.tsx:1` | `Cannot find name 'ok'` | **lixo commitado — ver X3** |
| `src/features/auth/screens/WelcomeScreen.tsx:65` | `'100dvh'` não é `DimensionValue` | só web; nativo usa `'100%'` |
| `src/features/food-log/components/DateChip.tsx:16` | `focused` não existe em `PressableStateCallbackType` | inerte no nativo |
| `src/shared/components/Button.tsx:61` | retorno do callback de `style` tipado `unknown[]` | inerte |
| `src/shared/components/Card.tsx:19` | `ViewProps` espalhado em `TouchableOpacity` | inerte |
| `src/shared/components/Skeleton.tsx:41` | `width: string \| number` vs `DimensionValue` | inerte |

Os 19 de teste são fixtures desatualizadas (falta `mealType` em `Meal`, `completedToday` em
`PlannedMeal`, `PostAchievement`) — herança do RN 0.85/React 19, sem efeito em runtime.

### X1a — ALTA — ✅ VERIFICADO — títulos sem fonte da marca em duas telas de perfil

Este é o erro de tipo que **é** um bug de UI, e vale destacar:

- **Onde:** `ProfileGoalsScreen.tsx:64` e `ProfileCoachPersonalityScreen.tsx:66`
- **Causa:** `Text` aceita `Variant = 'heading1' | 'heading2' | 'body' | 'caption' | 'label'`
  (`src/shared/components/Text.tsx:5`). As duas telas passam `variant="heading3"`, que não existe.
  Em runtime `styles['heading3']` é `undefined`, então o array de estilo fica
  `[undefined, optionTitle, style]` — **nenhum estilo de variante é aplicado**.
- **Usuário vê:** os `optionTitle` das duas telas só recebem `color` e `fontSize`
  (linhas 111-114 e 113-116). Sem `fontFamily`, o título cai na fonte do sistema (Roboto no
  Android, SF no iOS) em peso regular, enquanto todo o resto do app usa Inter Bold. Os títulos de
  "Metas e objetivos" e "Personalidade do Coach" ficam visivelmente fora do padrão.
- **Correção:** adicionar `heading3` ao `Variant` e ao `StyleSheet` do `Text`, **ou** trocar as
  duas chamadas para `heading2`. Decisão em DD1 (§5).

### X2 — ALTA — ✅ VERIFICADO — suíte de testes vermelha

`cd app && ./node_modules/.bin/jest` → **2 suítes, 4 testes falhando** (60 suítes / 270 testes passam).

- `DashboardScreen.test.tsx` (3 testes) — `Couldn't find a navigation object. Is your component
  inside NavigationContainer?`, disparado em `DietPlanSection.tsx:18` (`useNavigation`). É falha
  de **harness**: o teste renderiza `DashboardScreen` sem `NavigationContainer`. No app real o
  dashboard está dentro do tab navigator, então não há bug de produção aqui — mas o time está sem
  baseline verde.
- `OnboardingOptionCard.test.tsx` (1 teste) — "aplica borda primary quando selected=true".

### X3 — ALTA — ✅ VERIFICADO — arquivo lixo commitado no navigation

`app/src/navigation/TabNavigator.next.tsx` tem **2 bytes**: `od -c` mostra `o k`. É o texto "ok"
salvo por engano. Ninguém importa, mas está sob `roots` do `tsc` e é o `TS2304` da tabela do X1.

### X4 — ALTA — ✅ VERIFICADO — nada barra código quebrado antes do release

- Não existe CI: `find . -path "*workflows*" -name "*.yml"` (fora de `node_modules`) → vazio.
- O único gate é `app/.husky/pre-commit` → `npx lint-staged`, que roda **eslint --fix e prettier
  em arquivos staged**. Não roda `tsc`, não roda `jest`.
- É por isso que X1, X2 e X3 chegaram à `main` e sobreviveram a um release publicado.

---

## 5. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DD1 | `heading3` (X1a) | **Adicionar `heading3` ao `Text`** (Inter Bold, `fontSize.lg`, entre `heading2` e `body`). As duas telas já querem esse degrau — trocar para `heading2` mudaria a hierarquia visual de propósito. |
| DD2 | Dark mode (I5, N1) | **Fixar o app em claro** nas duas plataformas (`UIUserInterfaceStyle = Light`, `Theme.AppCompat.Light.NoActionBar`). Dark mode de verdade exige repensar a paleta inteira — é produto, não correção de bug. |
| DD3 | Conta demo (AP1) | **Flag `is_demo` no perfil + bloqueio no backend**, não no app. Bloquear só no cliente deixaria o endpoint aberto; e a Apple pode reinstalar builds antigos, que não teriam a trava do cliente. `DELETE /users/me` responde 403 `DEMO_ACCOUNT_PROTECTED` para a conta demo. |
| DD4 | Popular a conta demo (AP2) | **Script idempotente versionado** (`backend/scripts/seed-demo-account.ts`) e não SQL manual: precisa rodar de novo antes de cada submissão para reidratar dados que expiram por data (dieta do dia, streak, check-ins). |
| DD5 | R8 (N2) | **Não adicionar keep rules preventivas.** Regra nova só com stack trace de crash do smoke test. Keep rule especulativa incha o dex e esconde o problema real. |
| DD6 | Baseline de testes (X2) | **Consertar as 2 suítes**, não marcar como known-failure. O gate de CI do X4 só tem valor sobre baseline verde. |
| DD7 | Escopo do botão voltar (N4) | Nesta spec, **só confirmação de descarte** nos 3 formulários com conteúdo digitado. Predictive back e política global de saída ficam para spec própria. |
| DD8 | Erros de tipo inertes (X1) | Corrigir **todos** os 8 de produção e os 19 de teste. Meia correção não permite ligar o gate de CI. |
| DD9 | Validação do onboarding (R1) | **Validar por passo, no avanço**, não só no envio. O Coach repergunta com a razão ("Não entendi a altura — me manda só o número, ex: 180"). Validar apenas no submit faria o usuário refazer os 7 passos. |
| DD10 | Vírgula decimal (R1) | **Normalizar `,` → `.` na entrada** em vez de bloquear. "1,80" é como o brasileiro escreve; recusar seria culpar o usuário por acertar. Aceitar metros (1,80) e centímetros (180) no mesmo campo. |
| DD11 | Timeout do avatar (R2) | **Igualar ao scanner (75 s)**, que já provou ser o valor necessário para o mesmo payload — em vez de escolher um número novo. |
| DD12 | Metas sem plano (R5) | **Estado vazio explícito**, nunca default. Número inventado num app de nutrição é pior que a ausência dele. Deleta `DEFAULT_*_GOAL`. |
| DD13 | Áudio no Coach (R4) | **Fora deste ciclo.** Feature nova no lote que destrava a Apple atrasa o destrave. |
| DD14 | Layout de tablet (R7) | **Extrair o `shell` que Dashboard e Diário já usam** para um componente compartilhado, em vez de inventar breakpoints. Padrão já validado no app. |

---

## 6. Requisitos

### Bloco AP — desbloquear a review da Apple

- **AP1.1** Migração adiciona `is_demo BOOLEAN NOT NULL DEFAULT false` à tabela de perfis.
- **AP1.2** `deleteUserAccount` (`backend/src/modules/users/users.service.ts:144`) lança
  `AppError(403, 'DEMO_ACCOUNT_PROTECTED', …)` quando o perfil tem `is_demo = true`.
- **AP1.3** `ProfileScreen` trata o 403 com mensagem própria em vez do erro genérico.
- **AP1.4** Teste de integração: `DELETE /users/me` em conta demo → 403 e o usuário **continua
  existindo**; em conta comum → 204 e o usuário some.
- **AP2.1** `backend/scripts/seed-demo-account.ts` cria/atualiza a conta demo com: perfil completo,
  dieta ativa com o dia de hoje gerado, 3 refeições no diário de hoje, histórico de peso de 4
  semanas, 1 desafio ativo com streak e 2 posts no feed. Idempotente por e-mail.
- **AP2.2** O script marca `is_demo = true` e é documentado no runbook.
- **AP3.1** `docs/ios-publicacao.md` ganha a seção "App Review Information" com o texto exato a
  colar (credenciais, notas para o revisor, aviso de re-seed antes de cada submissão).

### Bloco I — iOS

- **I1.1** `project.pbxproj`: `PrivacyInfo.xcprivacy` ganha `PBXBuildFile` e entra na
  `PBXResourcesBuildPhase` do target `calorIA` (`13B07F8E1A680F5B00A75B9A`).
- **I2.1** `PrivacyInfo.xcprivacy`: `NSPrivacyCollectedDataTypes` preenchido com e-mail, nome,
  user ID, saúde/fitness, fotos e conteúdo do usuário — cada um com `Linked: true`,
  `Tracking: false` e as finalidades corretas.
- **I3.1** `Info.plist`: remover `NSLocationWhenInUseUsageDescription`.
- **I4.1** `LaunchScreen.storyboard`: sem "Powered by React Native"; wordmark do CalorIA sobre
  `#FAF8F4`.
- **I5.1** `Info.plist`: `UIUserInterfaceStyle = Light`.
- **I5.2** `LaunchScreen.storyboard`: `backgroundColor` fixo `#FAF8F4` (não `systemBackgroundColor`).
- **I6.1** `Info.plist` `CFBundleDisplayName` e `app/app.json` `displayName` → `CalorIA`.

### Bloco N — Android

- **N1.1** `styles.xml`: parent → `Theme.AppCompat.Light.NoActionBar`, com
  `<item name="android:windowBackground">` apontando para uma cor `#FAF8F4` declarada em
  `res/values/colors.xml`.
- **N2.1** Smoke test de release do `docs/mobile-hardening.md` §6 executado sobre `.aab` assinado,
  com `adb logcat` capturado. Resultado registrado no plano — inclusive se passar limpo.
- **N2.2** Keep rule nova **somente** se o smoke test crashar, com o stack trace no commit.
- **N3.1** `ProfileSetupScreen.tsx:152` → `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
- **N4.1** `CreatePostScreen`, `CreateChallengeScreen` e `ProfileEditScreen` confirmam descarte no
  voltar quando há conteúdo digitado (`usePreventRemove`/`beforeRemove` do React Navigation, que
  cobre voltar por gesto, header e botão do Android numa única implementação).
- **N5.1** `strings.xml` `app_name` → `CalorIA`.

### Bloco R — bugs relatados pelo cliente

- **R1.1** `advanceWithAnswer` valida o passo **antes** de avançar; inválido → o Coach repergunta
  com a razão, sem consumir o passo.
- **R1.2** `height` e `weight` normalizam `,` → `.`; altura aceita metros (1,80) e centímetros
  (180); faixas 100-250 cm e 30-300 kg.
- **R1.3** `keyboardType="numeric"` nos passos `height` e `weight`.
- **R1.4** O `catch` de `submitProfile` mostra `error.response.data.message` quando existe;
  genérica só na ausência. Timeout/rede distinguido de validação.
- **R1.5** `submitProfile` tem guarda de reentrância (`if (submitting) return`).
- **R1.6** Teste de regressão: onboarding com `"1,80"` / `"80,5"` envia `180` / `80.5`, nunca `NaN`.
- **R2.1** `uploadAvatar` usa `{ timeout: 75000 }`, igual ao `analyzePhoto`.
- **R2.2** A limpeza de avatares antigos (`users.service.ts:112-122`) sai do caminho crítico do
  request.
- **R2.3** `handleChangePhoto` separa timeout/rede de 502 `UPLOAD_FAILED` e 422 `INVALID_IMAGE`.
- **R3.1** `sugar_g`, `fiber_g` e `sodium_mg` expostos pelo backend como `number | null`.
- **R3.2** `Meal` do app ganha `sugar`, `fiber`, `sodium`; `FoodLogItem` e o card de macros do
  Dashboard os exibem, **omitindo** o campo sem dado (nunca `0g`).
- **R5.1** `DEFAULT_CALORIE_GOAL`, `DEFAULT_PROTEIN_GOAL`, `DEFAULT_CARBS_GOAL` e
  `DEFAULT_FAT_GOAL` **deletados**; `getDailyCalorieGoal` retorna `number | null`.
- **R5.2** Sem plano → estado explícito com CTA para o Coach.
- **R6.1** `isProfileComplete` derivado no store de auth (altura **e** peso **e** objetivo).
- **R6.2** `showAuthenticatedApp = isAuthenticated && isProfileComplete`; indeterminado → splash;
  falha de rede na checagem → tratar como completo.
- **R7.1** `ScreenShell` extraído do padrão de Dashboard/Diário
  (`width: '100%', maxWidth: 760, alignSelf: 'center'`) e aplicado nas 20 telas restantes,
  começando por `ProfileEditScreen`.

### Bloco X — cross-platform e processo

- **X1.1** `Text.tsx`: `heading3` no `Variant` e no `StyleSheet` (DD1).
- **X1.2** Os outros 6 erros de produção corrigidos (`WelcomeScreen`, `DateChip`, `Button`,
  `Card`, `Skeleton` — o 7º e 8º são X1a e X3).
- **X1.3** Os 19 erros de teste corrigidos nas fixtures.
- **X2.1** `DashboardScreen.test.tsx` envolve o render em `NavigationContainer`.
- **X2.2** `OnboardingOptionCard.test.tsx` verde.
- **X3.1** `app/src/navigation/TabNavigator.next.tsx` deletado.
- **X4.1** `.github/workflows/ci.yml`: em push e PR, roda `npm ci`, `npm run lint`,
  `npm run type-check` e `npm test` em `app/` (e o equivalente em `backend/`).
- **X4.2** `app/.husky/pre-push` roda `npm run type-check` — feedback local antes do CI.

---

## 7. Critérios de aceite

1. `cd app && npm run type-check` → **0 erros**.
2. `cd app && npm test` → **0 suítes falhando**.
3. `cd app && npx react-native bundle --platform android --dev false …` → exit 0 (não regrediu).
4. `find app/src -name "TabNavigator.next.tsx"` → vazio.
5. Um PR com erro de tipo proposital é **barrado pelo CI**.
6. `unzip -l` do `.ipa` mostra `PrivacyInfo.xcprivacy` dentro do `.app`.
7. `plutil -p ios/calorIA/Info.plist` não tem `NSLocationWhenInUseUsageDescription` e tem
   `UIUserInterfaceStyle = Light`.
8. `DELETE /users/me` autenticado como conta demo → 403 `DEMO_ACCOUNT_PROTECTED`, e o usuário
   continua no banco.
9. Rodar `seed-demo-account.ts` duas vezes seguidas não duplica nada e deixa o dashboard da conta
   demo com dieta do dia, diário, peso, desafio e feed populados.
10. **Aparelho Android em modo escuro:** abrir o app, abrir um `Alert`, focar um `TextInput` —
    nenhuma superfície escura (N1).
11. **Aparelho Android:** `.aab` de release assinado instala, abre, e o fluxo
    login → dashboard → scanner → diário → feed → perfil roda sem crash, com `adb logcat` limpo (N2).
12. **Aparelho Android:** focar campos no `ProfileSetupScreen` com o teclado aberto não corta o
    botão de avançar (N3).
13. **Aparelho Android:** voltar com conteúdo digitado nos 3 formulários pede confirmação (N4).
14. **Aparelho iOS em modo escuro:** splash é `#FAF8F4`, não preta (I5).
15. Launch screen do iOS não contém "Powered by React Native" (I4).
16. As telas "Metas e objetivos" e "Personalidade do Coach" mostram os títulos das opções em Inter
    Bold, igual ao resto do app (X1a).
17. **R1:** onboarding respondendo `"1,80"` / `"80,5"` envia `heightCm: 180` e `weightKg: 80.5` —
    nunca `null`. Resposta não numérica ("um metro e oitenta") é barrada **antes** do envio, com o
    Coach repreguntando.
18. **R1:** erro do backend chega ao usuário com a causa ("Altura deve ser um número"), não com a
    mensagem genérica.
19. **R2:** ⚠️ APARELHO — enviar foto da galeria no tablet, em rede móvel, conclui sem erro.
20. **R3:** açúcar aparece no Diário e no card de macros do Dashboard, vindo de `foods.sugar_g`.
21. **R5:** conta sem plano de dieta mostra estado explícito com CTA — **nenhum** número de meta
    inventado na tela.
22. **R6:** logar com conta de perfil incompleto cai no `ProfileSetup`, não no Dashboard.
23. **R7:** ⚠️ APARELHO — nenhuma das 25 telas estica de ponta a ponta no tablet em paisagem.
24. **R4:** nada a verificar — feature fora de escopo, movida para spec própria.

---

## 8. Fora de escopo

- **Áudio para o Coach IA (R4)** — feature nova, não correção. Exige gravação nativa nas duas
  plataformas, permissão de microfone (mais um item de review da Apple), upload e transcrição com
  custo por minuto. **Spec própria**, depois do destrave da Apple.
- Dark mode de verdade (DD2) — spec própria.
- Predictive back do Android 16 e política global de saída do app (DD7).
- Instalar Google/Apple Sign-In. **Aviso registrado:** no dia em que o Google Sign-In entrar, a
  Guideline 4.8 passa a exigir Sign in with Apple no mesmo release.
- Universal Links / App Links com domínio próprio (`docs/mobile-hardening.md` §5).
- Tokens no Keychain/Keystore e crash reporting (`docs/mobile-hardening.md` §§1-2).
- Os bugs da `docs/spec-bugs-pos-lancamento.md` — reconferidos, já corrigidos.

---

## 9. Bugs relatados pelo cliente no Android (sessão de debug 2)

Relatados em 2026-09-08 com 3 prints de um **tablet Samsung em paisagem**. Cada um foi
investigado com a mesma disciplina; R1 tem loop vermelho automatizado.

| ID | Sev. | Estado | Bug |
|---|---|---|---|
| R1 | **CRÍTICA** | ✅ **REPRODUZIDO** | Onboarding manda `null` e o perfil nunca salva |
| R2 | ALTA | ✅ VERIFICADO | Upload da foto de perfil estoura em 10 s |
| R3 | MÉDIA | ✅ VERIFICADO | Açúcar/fibra/sódio existem no banco e nunca chegam ao app |
| R4 | — | ✅ VERIFICADO | Áudio para o Coach: **o recurso não existe** (não é bug) |
| R5 | ALTA | ✅ VERIFICADO | Dashboard inventa metas quando não há plano |
| R6 | ALTA | ✅ VERIFICADO | Dá para chegar ao app sem perfil preenchido |
| R7 | MÉDIA | ✅ VERIFICADO | 20 de 25 telas sem limite de largura — esticadas no tablet |

---

### R1 — CRÍTICA — ✅ REPRODUZIDO — "Não foi possível salvar seu perfil" (print 1)

**A mensagem não é do Dashboard.** A string existe em um único lugar:
`app/src/features/auth/screens/ProfileSetupScreen.tsx:138` — o **onboarding**. O print mostra o
Dashboard atrás porque `Alert.alert` no Android é um diálogo nativo da Activity: ele **sobrevive**
à troca da árvore React que o `setToken` dispara.

**Cadeia da falha, provada ponta a ponta:**

1. `ProfileSetupScreen` usa **um TextInput genérico** para todos os passos de texto livre
   (`ProfileSetupScreen.tsx:181-191`). Sem `keyboardType`, sem máscara, sem validação —
   `handleSend` só checa `inputText.trim()` não-vazio.
2. O usuário brasileiro digita a altura como **"1,80"** (ou "1,80 m", ou o peso como "80,5").
3. `submitProfile` faz `Number(finalAnswers.height ?? 0)` (`ProfileSetupScreen.tsx:117-118`).
   `Number("1,80")` é **`NaN`**.
4. `JSON.stringify` converte `NaN` em **`null`**. Payload real capturado no teste:
   ```json
   {"name":"Rafael","bodyType":"ectomorph","heightCm":null,"weightKg":null,
    "goal":"lose_weight","coachPersonality":"motivational","coachGender":"neutral"}
   ```
5. O backend recebe em `PUT /users/me/profile` (`app/src/shared/services/auth.service.ts:80-91`).
   O schema é `height_cm: z.number(...).optional()` (`backend/src/modules/users/users.schemas.ts:61`).
   **`.optional()` aceita `undefined`, não `null`.** Verificado rodando o zod do próprio projeto:
   ```
   180       -> ACEITO
   null      -> REJEITADO: Invalid input: expected number, received null
   undefined -> ACEITO
   ```
6. → 422. O `catch` do app descarta a mensagem do backend ("Altura deve ser um número") e mostra
   **"Não foi possível salvar seu perfil. Tente novamente."**

**Usuário vê:** responde tudo, toma um erro que não explica nada, tenta de novo digitando
exatamente a mesma coisa, e toma o mesmo erro. Não há saída — o onboarding fica inescapável.

**Loop vermelho (1,07 s, determinístico):** teste que percorre o onboarding respondendo `"1,80"`
e `"80,5"` e afirma que o payload não contém `NaN`. Falha hoje nas duas asserções.

**Correção:** validar cada passo **antes** de avançar — normalizar vírgula para ponto, aceitar
faixa plausível (altura 100-250 cm, peso 30-300 kg), `keyboardType="numeric"` nos passos
numéricos, e o Coach repergunta em vez de aceitar lixo. E propagar a mensagem do backend no erro.

---

### R2 — ALTA — ✅ VERIFICADO — "Não foi possível enviar a foto" (prints 2 e 3)

**Onde:** `app/src/features/profile/screens/ProfileEditScreen.tsx:83` ·
`app/src/shared/services/profile.service.ts:27-28`

**A prova está no próprio repositório.** Os dois caminhos de upload de imagem mandam **o mesmo
payload**, gerado pelo mesmo `pickImage()` com as mesmas `OPTIONS`
(`image-picker.service.ts:5-11` — base64, 1024 px, qualidade 0.8):

| Caminho | Endpoint | Timeout |
|---|---|---|
| Scanner (`scanner.service.ts:48-50`) | `POST /scanner/analyze` | **`{ timeout: 75000 }` — override explícito** |
| Avatar (`profile.service.ts:27-28`) | `POST /users/me/avatar` | **default: `API_TIMEOUT=10000`** |

Alguém já descobriu que 10 s não bastam para subir uma dessas imagens e subiu o scanner para 75 s.
**O avatar nunca recebeu o mesmo tratamento.** E o avatar faz *mais* trabalho de servidor que o
scanner por request: upload no Storage → `getPublicUrl` → `UPDATE profiles` → `storage.list()` →
`storage.remove()` das fotos antigas (`backend/src/modules/users/users.service.ts:92-122`) — cinco
idas ao Supabase em série, dentro dos 10 s, somadas ao cold start da Vercel.

Descartados: o `bodyLimit` do Fastify é 8 MB (`users.routes.ts:92`), o bucket `avatars` e as
policies existem (`012_avatar.sql`), e um JPEG 1024 px q0.8 em base64 dá ~200-400 KB — longe do
limite de 4,5 MB da Vercel.

**Correção:** `timeout: 75000` no `uploadAvatar`, igual ao scanner; mover a limpeza das fotos
antigas para fora do request; e distinguir timeout de 502 na mensagem.

---

### R3 — MÉDIA — ✅ VERIFICADO — açúcar, fibra e sódio existem no banco e nunca chegam ao app

**O dado já está lá.** `backend/supabase/migrations/002_foods.sql:22-26` declara
`fiber_g`, `sugar_g` e `sodium_mg`. Mas o tipo `Meal` do app
(`app/src/shared/services/food-log.service.ts:6-15`) só tem `calories`, `protein`, `carbs`, `fat`,
e o Diário renderiza exatamente isso:

```
FoodLogItem.tsx:34 → "Proteínas Xg · Carboidratos Yg · Gorduras Zg"
```

Nenhuma menção a açúcar em `app/src` ou nas rotas do backend — o dado morre na tabela `foods`.

**Não é coleta de dado novo: é encanamento.** Expor `sugar_g`/`fiber_g`/`sodium_mg` da tabela
`foods` até o `Meal` do app, e exibi-los no Diário e no card de macros do Dashboard.

> **⚠️ Ambiguidade a confirmar com o cliente — ver §9.1.**

---

### R4 — ✅ VERIFICADO — áudio para o Coach: o recurso não existe

Não é um bug: **nunca foi construído.**

- `app/src/features/coach/components/ChatInput.tsx` é um `TextInput` + botão de enviar. Não há
  botão de microfone.
- `package.json` não tem nenhuma lib de gravação de áudio.
- `grep -rni "audio|voice|record|microfone"` em `app/src` → nada.
- O `AndroidManifest.xml` não declara `RECORD_AUDIO`; o `Info.plist` não tem
  `NSMicrophoneUsageDescription`.
- O backend (`POST /chat`) recebe só texto, com `max 2000 caracteres`
  (`backend/src/modules/chat/chat.schemas.ts:10`).

**É uma feature nova, de porte real:** gravação nativa nas duas plataformas + permissão de
microfone (e o `NSMicrophoneUsageDescription` vira mais um item de review da Apple) + upload do
áudio + transcrição (Whisper ou equivalente) + custo por minuto + UI de gravar/ouvir/cancelar.

**Recomendação:** tratar como spec própria, **fora** deste ciclo de correções. Misturar uma feature
nova no lote que vai destravar a Apple atrasa o destrave.

---

### R5 — ALTA — ✅ VERIFICADO — o Dashboard inventa metas quando não há plano

O print 1 mostra **2000 kcal, 150 g de proteína, 250 g de carboidrato, 65 g de gordura**. Esses
números não vieram do servidor:

```
app/src/shared/utils/calories.ts:4          DEFAULT_CALORIE_GOAL = 2000
app/src/features/dashboard/screens/DashboardScreen.tsx:16-18
                                            DEFAULT_PROTEIN_GOAL = 150
                                            DEFAULT_CARBS_GOAL   = 250
                                            DEFAULT_FAT_GOAL     = 65
```

São constantes hardcoded no cliente. `getDailyCalorieGoal` (`calories.ts:6-8`) cai nelas sempre que
`plan` é nulo ou tem `totalCalories === 0`.

**Usuário vê:** um painel que parece pessoal e não é. Alguém com 1,60 m querendo perder peso e
alguém com 1,90 m querendo ganhar massa veem exatamente as mesmas metas — e não têm como saber.
É pior que um estado vazio honesto: induz a decisão errada num app de nutrição.

**Correção:** sem plano → estado explícito ("Gere sua dieta para ver suas metas") com CTA para o
Coach, nunca número inventado.

---

### R6 — ALTA — ✅ VERIFICADO — dá para chegar ao app sem perfil preenchido

`RootNavigator` decide a árvore **só** por `isAuthenticated` (`RootNavigator.tsx:83-85,111`).
Não existe nenhuma checagem de perfil completo.

**Consequência:** quem trava no R1, fecha o app e depois **faz login** entra direto no Dashboard —
autenticado, sem altura, sem peso, sem objetivo. Sem esses dados o backend não consegue gerar
dieta (`jobs.service.ts:39` calcula o gasto basal com `weight_kg` e `height_cm`), então nunca há
plano, e o R5 preenche o buraco com números falsos. **R1 → R6 → R5 é uma cadeia só**, e é
exatamente o estado do print 1.

**Correção:** o `RootNavigator` também exige perfil completo; incompleto → volta ao `ProfileSetup`.

---

### R7 — MÉDIA — ✅ VERIFICADO — o app não tem layout de tablet

Só **5 das 25 telas** limitam a largura do conteúdo:

| Limita (`maxWidth`) | Não limita |
|---|---|
| Welcome (420), Register (420), Login (420), Dashboard (760), Diário (760) | as outras 20 — incluindo **Editar perfil**, Coach, Comunidade, Desafios, Perfil, Evolução, Scanner |

`grep` por `useWindowDimensions`, `Dimensions.get`, `isTablet` ou breakpoint em `app/src` → **nada**.
Não há layout responsivo em lugar nenhum.

**Usuário vê (prints 2 e 3):** no tablet em paisagem o "Editar perfil" estica de ponta a ponta —
o botão "Salvar nome" vira uma barra verde de ~1300 px, o campo de nome idem, e a grade de emojis
fica perdida no vazio. O padrão `shell` que o Dashboard e o Diário já usam
(`width: '100%', maxWidth: 760, alignSelf: 'center'`) resolve, e só não foi aplicado nas demais.

**Correção:** extrair o `shell` para um componente compartilhado e aplicá-lo nas 20 telas restantes.

---

## 9.1. ⚠️ Ambiguidade a confirmar antes de implementar o R3

O relato foi: *"ta feio a ux da segunda aba e precisa estar descrito: açucar, proteina,
carboidrato e etc (segundo print)"*.

"Segunda aba" e "segundo print" apontam para telas diferentes, e a leitura muda o trabalho:

- **Leitura A — "segunda aba" = Diário** (2ª aba da barra: Dashboard · **Diário** · Coach ·
  Comunidade · Perfil). Encaixa com "açúcar, proteína, carboidrato": é a tela que lista refeições
  com macros. Trabalho: R3 (encanar açúcar/fibra/sódio) + R7 no Diário.
- **Leitura B — "segundo print" = Editar perfil.** Encaixa com "tá feio" (é a tela esticada dos
  prints 2 e 3), mas essa tela **não tem macro nenhum** — então "açúcar, proteína, carboidrato"
  teria que se referir ao Dashboard do print 1.

**Assumido no plano: leitura A** — a tarefa de macros vai para o Diário e o Dashboard, e o R7
cobre Editar perfil de qualquer jeito. Se for outra coisa, é só trocar o alvo da tarefa R3.
