# Correções Android/iOS + review da Apple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa.
> Passos usam checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-09-08-android-ios-review-apple.md`

**Goal:** Destravar a review da Apple, fechar os achados de compliance de iOS, corrigir os
problemas de Android mapeados na sessão de debug e devolver ao repositório um baseline verde
com CI que o proteja.

**Architecture:** Quatro blocos independentes. O bloco X (baseline) vem **primeiro** porque o
gate de CI que ele instala é o que valida todo o resto. O bloco AP roda em paralelo por ser o
único com urgência comercial. I e N são folhas.

**Tech Stack:** React Native 0.85.3 (bare) + React 19.2.3, Fastify + Supabase no backend,
EAS Build para iOS, Gradle/R8 para Android, jest + tsc como loop de verificação.

---

## Global Constraints

- Branch: criar `fix/android-ios-review-apple` a partir de `main` (`f643cce`). Nunca na main.
- Comandos do app rodam em `app/`; os do backend em `backend/`.
- **`node_modules` não vem no repositório** — rodar `npm install` em `app/` antes de qualquer
  coisa, senão nem `tsc` nem `jest` existem (foi o que aconteceu nesta sessão de debug).
- **Baseline atual (medida, não estimada):** `tsc --noEmit` → 27 erros;
  `jest` → 2 suítes / 4 testes falhando; `react-native bundle --platform android` → verde.
  Nenhuma tarefa pode piorar nenhum dos três.
- Toda tarefa marcada **⚠️ APARELHO** exige aparelho ou emulador. O agente **para** e devolve o
  comando exato para o humano rodar; não marcar como feita sem a saída colada de volta.
- Nenhuma keep rule de R8 entra sem stack trace de crash real (DD5).

---

## Fase 0 — Baseline verde e gate (bloco X)

Sem isso, nenhuma das outras fases tem como ser verificada.

### Task X3: deletar o arquivo lixo do navigation

**Files:** Delete: `app/src/navigation/TabNavigator.next.tsx`

- [ ] **Step 1: confirmar que é lixo e que ninguém importa**

Run: `cd app && od -c src/navigation/TabNavigator.next.tsx && grep -rn "TabNavigator.next" src`
Expected: `0000000 o k` (2 bytes) e nenhum import.

- [ ] **Step 2: deletar**

Run: `cd app && rm src/navigation/TabNavigator.next.tsx`

- [ ] **Step 3: verificar**

Run: `cd app && ./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 26 (era 27; o `TS2304 Cannot find name 'ok'` sumiu).

---

### Task X1a: variante `heading3` no componente `Text`

**Files:** Modify: `app/src/shared/components/Text.tsx`; Add: `app/src/shared/components/Text.test.tsx`

**Interfaces:** Produces: `Variant` passa a incluir `'heading3'`.

- [ ] **Step 1: teste de regressão que falha primeiro**

Escrever em `Text.test.tsx` um teste que renderiza `<Text variant="heading3">Oi</Text>` e afirma
que o estilo resultante tem `fontFamily === typography.fontFamily.bold` e
`fontSize === typography.fontSize.lg`.

Run: `cd app && ./node_modules/.bin/jest src/shared/components/Text.test.tsx`
Expected: FAIL — hoje `styles['heading3']` é `undefined` e nenhum estilo de variante é aplicado.

- [ ] **Step 2: adicionar a variante**

```ts
// app/src/shared/components/Text.tsx
type Variant = 'heading1' | 'heading2' | 'heading3' | 'body' | 'caption' | 'label';

// no StyleSheet, entre heading2 e body:
  heading3: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    lineHeight: typography.fontSize.lg * typography.lineHeight.tight,
  },
```

- [ ] **Step 3: verificar**

Run: `cd app && ./node_modules/.bin/jest src/shared/components/Text.test.tsx && ./node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: teste PASS; contagem 24 (caíram os dois `TS2820` de `heading3`).

> **Nota de UI:** este é o passo que devolve Inter Bold aos títulos das opções em
> "Metas e objetivos" e "Personalidade do Coach". Guardar um print antes/depois — é a evidência
> do critério de aceite 16.

---

### Task X1b: os 6 erros de tipo restantes em produção

**Files:** Modify: `app/src/features/auth/screens/WelcomeScreen.tsx`,
`app/src/features/food-log/components/DateChip.tsx`, `app/src/shared/components/Button.tsx`,
`app/src/shared/components/Card.tsx`, `app/src/shared/components/Skeleton.tsx`

- [ ] **Step 1: listar o alvo exato**

Run: `cd app && ./node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.test\."`
Expected: 6 linhas.

- [ ] **Step 2: corrigir cada uma sem mudar comportamento**

Todas são estreitamento de tipos do RN 0.85 — **nenhuma muda runtime**. Diretrizes:
- `WelcomeScreen.tsx:65` — tipar o `Platform.select` como `DimensionValue` (o `'100dvh'` é
  legítimo no react-native-web; manter o valor, corrigir o tipo).
- `DateChip.tsx:16` e `Button.tsx:61` — `focused` só existe no react-native-web. Usar o mesmo
  guard `'focused' in state` que o `Button` já aplica em `hovered`, e tipar o retorno do callback
  como `StyleProp<ViewStyle>`.
- `Card.tsx:19` — separar os props de `View` dos de `TouchableOpacity` em vez de espalhar
  `ViewProps` nos dois.
- `Skeleton.tsx:41` — tipar `width` como `DimensionValue`.

**Proibido:** `any`, `@ts-expect-error` ou `as unknown as`. Se algum caso não fechar sem escape,
parar e reportar — é sinal de problema de design, não de tipo.

- [ ] **Step 3: verificar**

Run: `cd app && ./node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.test\." | wc -l`
Expected: 0

---

### Task X1c: as 19 fixtures de teste desatualizadas

**Files:** Modify: os `*.test.ts(x)` listados pelo `tsc`

- [ ] **Step 1: listar**

Run: `cd app && ./node_modules/.bin/tsc --noEmit 2>&1 | grep "error TS" | grep "\.test\."`
Expected: 19 linhas — falta `mealType` em `Meal`, `completedToday` em `PlannedMeal`,
`PostAchievement` recebendo `null`, e dois `jest.fn()` retornados de callback de `it()`.

- [ ] **Step 2: completar as fixtures**

Preencher os campos faltantes com valores realistas (não `as Meal`, não `@ts-ignore`) e trocar
`it('...', () => jest.fn())` por corpo com chaves.

- [ ] **Step 3: verificar**

Run: `cd app && ./node_modules/.bin/tsc --noEmit; echo "EXIT=$?"`
Expected: EXIT=0, nenhuma saída.

---

### Task X2: suíte de testes verde

**Files:** Modify: `app/src/features/dashboard/screens/DashboardScreen.test.tsx`,
`app/src/features/auth/components/OnboardingOptionCard.test.tsx`

- [ ] **Step 1: reproduzir**

Run: `cd app && ./node_modules/.bin/jest 2>&1 | tail -5`
Expected: `Test Suites: 2 failed, 60 passed` · `Tests: 4 failed, 270 passed`

- [ ] **Step 2: `DashboardScreen.test.tsx` — envolver em `NavigationContainer`**

A falha é `Couldn't find a navigation object`, vinda de `DietPlanSection.tsx:18`
(`useNavigation`). É harness, não produção: no app o dashboard vive dentro do tab navigator.
Envolver o render em `<NavigationContainer>` (as 3 chamadas de `render` do arquivo).

- [ ] **Step 3: `OnboardingOptionCard.test.tsx`**

Diagnosticar "aplica borda primary quando selected=true" e corrigir. Se a falha for do
**componente** e não do teste, tratar como bug de produção: corrigir o componente e registrar no
relatório da tarefa.

- [ ] **Step 4: verificar**

Run: `cd app && ./node_modules/.bin/jest 2>&1 | tail -4`
Expected: `Test Suites: 62 passed` · `Tests: 274 passed` (mais o novo teste da X1a).

---

### Task X4: CI e pre-push

**Files:** Add: `.github/workflows/ci.yml`, `app/.husky/pre-push`

**Depende de:** X1a, X1b, X1c, X2 e X3 — o gate só pode entrar sobre baseline verde (DD6).

- [ ] **Step 1: confirmar que não existe CI hoje**

Run: `find . -path "*workflows*" -name "*.yml" -not -path "*/node_modules/*"`
Expected: vazio. (Único gate atual: `app/.husky/pre-commit` → `npx lint-staged`.)

- [ ] **Step 2: o `package-lock.json` está desatualizado — conferir antes**

O `npm install` desta sessão de debug reescreveu uma linha do lock (`engines.node`:
`>= 22.11.0` no lock vs `>= 22.13.0` no `package.json`). A alteração foi **revertida** para não
sujar o diff, mas a divergência continua no repositório. Rodar `npm ci` em `app/` **antes** de
ligar o CI: se reclamar, commitar o lock ressincronizado como primeiro passo desta tarefa.

Run: `cd app && rm -rf node_modules && npm ci`
Expected: exit 0. Se falhar, `npm install` e commitar o `package-lock.json`.

- [ ] **Step 3: workflow**

`.github/workflows/ci.yml`, em `push` e `pull_request`, Node 22 (o `engines` do app pede
`>= 22.13.0`), dois jobs:
- `app`: `npm ci` · `npm run lint` · `npm run type-check` · `npm test` (working-directory `app`)
- `backend`: o equivalente do `backend/package.json`

- [ ] **Step 4: pre-push local**

`app/.husky/pre-push` → `npm run type-check`. (Não rodar `jest` no pre-push: 16 s de suíte
atrapalha o fluxo; o CI cobre.)

- [ ] **Step 5: provar que o gate morde**

Introduzir um erro de tipo proposital, commitar numa branch de teste, abrir PR, confirmar CI
vermelho, reverter.
Expected: CI falha no job `app`, passo `type-check`.

- [ ] **Step 6: verificar**

Run: `cd app && npm run lint && npm run type-check && npm test`
Expected: os três verdes.

---

## Fase 1 — Desbloquear a review da Apple (bloco AP)

Pode correr em paralelo com a Fase 0. **É o caminho crítico comercial.**

### Task AP0: ⚠️ HUMANO — resposta imediata à Apple

Não depende de código nenhum e pode ser feito hoje.

- [ ] **Step 1: criar a conta demo em produção**

Cadastrar pelo app (ou pela API de produção) um usuário `appreview@caloriaoficial.com.br` com
senha forte e completar o onboarding até o dashboard. O cadastro já autoconfirma o e-mail
(`backend/src/modules/auth/auth.service.ts:34` → `email_confirm: true`), então **não há link de
confirmação** para o revisor perseguir.

- [ ] **Step 2: preencher o App Store Connect**

App Store Connect → o app → **App Review Information**:
- marcar **Sign-In Required**
- **User Name:** o e-mail acima · **Password:** a senha
- **Notes:** dizer que o app é fechado por login por natureza (diário alimentar pessoal), que a
  conta já vem com dieta, diário e desafios populados, e **pedir que não usem "Excluir conta"**,
  que é destrutivo (a AP1 transforma isso em trava de servidor, mas a nota vale desde já).

- [ ] **Step 3: responder a mensagem no Resolution Center**

Confirmar que o app inclui login e que a conta demo foi adicionada. Reenviar o build.

- [ ] **Step 4: registrar**

Colar aqui a data do reenvio e o número do build. Sem isso a tarefa não fecha.

> **Não bloquear o reenvio** esperando as Fases 2 e 3. Este passo sozinho responde ao que a Apple
> pediu; o resto reduz o risco da rodada seguinte.

---

### Task AP1: proteger a conta demo contra exclusão (backend)

**Files:** Add: `backend/supabase/migrations/016_demo_account.sql`;
Modify: `backend/src/modules/users/users.service.ts`,
`app/src/features/profile/screens/ProfileScreen.tsx`;
Add: teste de integração em `backend`

**Interfaces:** Produces: `DELETE /users/me` → 403 `DEMO_ACCOUNT_PROTECTED` para `is_demo = true`.

- [ ] **Step 1: teste que falha primeiro**

Teste de integração: autenticar como conta com `is_demo = true`, chamar `DELETE /users/me`.
Expected: FAIL — hoje responde 204 e o usuário é apagado
(`users.service.ts:157` → `supabase.auth.admin.deleteUser`, hard delete).

- [ ] **Step 2: migração**

`016_demo_account.sql`: `ALTER TABLE ... ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;`
na tabela `public.profiles` (verificado em `backend/supabase/migrations/001_profiles.sql:7`).

- [ ] **Step 3: trava no serviço**

Em `deleteUserAccount` (`users.service.ts:144`), antes do `deleteUser`: ler `is_demo` do perfil e
`throw new AppError(403, 'DEMO_ACCOUNT_PROTECTED', 'Esta é uma conta de demonstração e não pode ser excluída.')`.

**A trava é de servidor por decisão (DD3):** um build antigo instalado pelo revisor não teria
guarda de cliente nenhuma.

- [ ] **Step 4: mensagem no app**

`ProfileScreen.tsx` mapeia o 403 `DEMO_ACCOUNT_PROTECTED` para a mensagem do backend, em vez do
erro genérico.

- [ ] **Step 5: verificar**

Run: teste de integração do Step 1 + um caso de conta comum.
Expected: demo → 403 e usuário **ainda existe**; comum → 204 e usuário sumiu.

---

### Task AP2: script de seed da conta demo

**Files:** Add: `backend/scripts/seed-demo-account.ts`; Modify: `backend/package.json` (script npm)

- [ ] **Step 1: escrever o script**

Idempotente por e-mail (rodar duas vezes não duplica). Cria/atualiza:
perfil completo · dieta ativa com o **dia de hoje** gerado · 3 refeições no diário de hoje ·
histórico de peso de 4 semanas · 1 desafio ativo com streak · 2 posts no feed. Marca `is_demo = true`.

- [ ] **Step 2: rodar duas vezes**

Run: `cd backend && npm run seed:demo && npm run seed:demo`
Expected: exit 0 nas duas; nenhuma duplicata.

- [ ] **Step 3: conferir no app**

Logar com a conta demo num build de desenvolvimento e percorrer dashboard → diário → desafios →
feed → perfil. Nenhuma seção vazia, nenhum "Algo deu errado".

> **Por que script e não SQL manual (DD4):** a dieta do dia, o streak e os check-ins expiram por
> data. Isso precisa ser reidratado **antes de cada submissão**, não uma vez.

---

### Task AP3: runbook de submissão

**Files:** Modify: `docs/ios-publicacao.md`

- [ ] **Step 1: seção "App Review Information"**

Documentar: credenciais da conta demo (referenciando o gestor de segredos, **nunca a senha em
texto no repositório**), o texto das Notes, e o checklist pré-submissão:
`npm run seed:demo` → conferir o dashboard da conta demo → confirmar o campo Sign-In Required.

- [ ] **Step 2: registrar o aviso da Guideline 4.8**

Uma linha: se um dia entrar `@react-native-google-signin/google-signin`, o **Sign in with Apple
passa a ser obrigatório no mesmo release**. Hoje não se aplica porque nenhuma lib social está
instalada e os dois botões ficam ocultos.

---

## Fase 2 — Compliance e polimento do iOS (bloco I)

### Task I1: colocar o `PrivacyInfo.xcprivacy` dentro do bundle

**Files:** Modify: `app/ios/calorIA.xcodeproj/project.pbxproj`

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -n "PrivacyInfo" ios/calorIA.xcodeproj/project.pbxproj`
Expected: exatamente 2 linhas (49 e 111) — `PBXFileReference` e membro do grupo. **Nenhum
`PBXBuildFile`, nenhuma entrada em `PBXResourcesBuildPhase`.** É a prova de que o arquivo não é
copiado.

- [ ] **Step 2: adicionar**

Duas edições:
1. Novo `PBXBuildFile` na sua seção, com `fileRef = 13B07FB81A68108700A75B9A`.
2. Esse novo id na lista `files` de `13B07F8E1A680F5B00A75B9A /* Resources */` (o target `calorIA`,
   **não** o de testes `00E356EC…`).

Usar id hexadecimal de 24 caracteres não colidente.

- [ ] **Step 3: verificar (estático, roda sem Xcode)**

Run: `cd app && grep -c "PrivacyInfo" ios/calorIA.xcodeproj/project.pbxproj && python3 -c "import plistlib,sys; plistlib.load(open('ios/calorIA.xcodeproj/project.pbxproj','rb'))" 2>/dev/null; echo "pbxproj parse ok se sem erro acima"`
Expected: 4 ocorrências; o pbxproj continua parseável.

- [ ] **Step 4: ⚠️ APARELHO/EAS — provar no artefato**

Após o próximo EAS build: `unzip -l <app>.ipa | grep PrivacyInfo`
Expected: uma linha dentro de `Payload/calorIA.app/`.

---

### Task I2: declarar a coleta de dados no manifesto de privacidade

**Files:** Modify: `app/ios/calorIA/PrivacyInfo.xcprivacy`

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -A1 "NSPrivacyCollectedDataTypes" ios/calorIA/PrivacyInfo.xcprivacy`
Expected: `<array/>` — declara coleta zero.

- [ ] **Step 2: preencher**

Mínimo, conferido contra o código: e-mail e nome (cadastro), user ID, **saúde e fitness**
(peso, altura, objetivo, calorias), **fotos** (scanner — `includeBase64: true` sobe a imagem),
**conteúdo do usuário** (posts e comentários). Cada um com `NSPrivacyCollectedDataTypeLinked
= true`, `Tracking = false` e finalidade `AppFunctionality`.

- [ ] **Step 3: alinhar o App Store Connect**

⚠️ HUMANO: as respostas de **App Privacy** no ASC precisam bater com o manifesto. Divergência é
motivo de rejeição e não é pega por validação automática.

- [ ] **Step 4: verificar**

Run: `cd app && plutil -lint ios/calorIA/PrivacyInfo.xcprivacy`
Expected: `OK`

---

### Task I3: remover a purpose string vazia de localização

**Files:** Modify: `app/ios/calorIA/Info.plist`

- [ ] **Step 1: confirmar que a permissão é morta**

Run: `cd app && grep -rn "Geolocation\|react-native-geolocation" src package.json | grep -v test`
Expected: vazio — o app não usa localização.

- [ ] **Step 2: remover**

Apagar `<key>NSLocationWhenInUseUsageDescription</key><string/>` do `Info.plist`. A chave presente
e vazia é tratada como ausente pela validação da Apple (família ITMS-90683).

- [ ] **Step 3: verificar**

Run: `cd app && plutil -lint ios/calorIA/Info.plist && plutil -p ios/calorIA/Info.plist | grep -c Location`
Expected: `OK` e `0`.

---

### Task I4+I5: launch screen da marca, sem dark mode

**Files:** Modify: `app/ios/calorIA/LaunchScreen.storyboard`, `app/ios/calorIA/Info.plist`

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -n "Powered by React Native\|systemBackgroundColor" ios/calorIA/LaunchScreen.storyboard; grep -c UIUserInterfaceStyle ios/calorIA/Info.plist`
Expected: os dois achados na storyboard e `0` para `UIUserInterfaceStyle`.

- [ ] **Step 2: storyboard**

Remover o label "Powered by React Native"; trocar o label de texto pelo wordmark do CalorIA;
`backgroundColor` fixo `#FAF8F4` (`colors.brandBackground`) em vez de `systemBackgroundColor`.

- [ ] **Step 3: `Info.plist`**

`<key>UIUserInterfaceStyle</key><string>Light</string>` (DD2 — o app é claro por design; dark mode
de verdade é escopo próprio).

- [ ] **Step 4: verificar**

Run: `cd app && grep -c "Powered by React Native" ios/calorIA/LaunchScreen.storyboard; plutil -p ios/calorIA/Info.plist | grep UIUserInterfaceStyle`
Expected: `0` e `"UIUserInterfaceStyle" => "Light"`.

- [ ] **Step 5: ⚠️ APARELHO — iPhone em modo escuro**

Abrir o app com o sistema em escuro. Expected: splash `#FAF8F4`, não preta; nenhuma superfície
escura no app.

---

### Task I6+N5: nome do app com C maiúsculo

**Files:** Modify: `app/ios/calorIA/Info.plist`, `app/app.json`,
`app/android/app/src/main/res/values/strings.xml`

- [ ] **Step 1: os três lugares**

`CFBundleDisplayName` → `CalorIA` · `app.json` `displayName` → `CalorIA` ·
`strings.xml` `app_name` → `CalorIA`.

**Não tocar** em `app.json` `name` (`calorIA`): é a chave de
`AppRegistry.registerComponent` (`index.js`) e do `self.moduleName` no `AppDelegate.mm:11`
e do `getMainComponentName()` no `MainActivity.kt`. Mudar isso faz o app abrir em tela branca.

- [ ] **Step 2: verificar**

Run: `cd app && grep -n '"name"' app.json && grep -n "moduleName" ios/calorIA/AppDelegate.mm`
Expected: `name` continua `calorIA` e bate com o `moduleName`.

---

## Fase 2.5 — Bugs relatados pelo cliente (bloco R)

Entram **entre a Fase 2 e a Fase 3**, e sempre **antes do N2** (smoke test de R8), para que ele
cubra o código final. R1 é a tarefa mais urgente do documento inteiro depois de AP0: trava o
cadastro de usuário novo.

### Task R1: validação do onboarding — o perfil precisa salvar

**Files:** Modify: `app/src/features/auth/screens/ProfileSetupScreen.tsx`,
`app/src/features/auth/screens/ProfileSetupScreen.test.tsx`

**Interfaces:** Produces: payload de `profileSetup` sempre com números válidos.

- [ ] **Step 1: reproduzir (o loop já existe, escrever como teste de regressão)**

Adicionar a `ProfileSetupScreen.test.tsx` um caso que percorre o onboarding respondendo `"1,80"`
para altura e `"80,5"` para peso, e afirma que o payload não tem `NaN`.

Run: `cd app && ./node_modules/.bin/jest src/features/auth/screens/ProfileSetupScreen.test.tsx`
Expected: **FAIL.** Payload capturado na sessão de debug:
```json
{"name":"Rafael","bodyType":"ectomorph","heightCm":null,"weightKg":null,
 "goal":"lose_weight","coachPersonality":"motivational","coachGender":"neutral"}
```
(`NaN` vira `null` no `JSON.stringify`; o zod do backend rejeita `null` para
`z.number().optional()` — confirmado rodando o zod do projeto.)

- [ ] **Step 2: validar por passo, no avanço (DD9)**

Em `advanceWithAnswer`, antes de gravar a resposta: validar o passo atual. Inválido → o Coach
repergunta com a razão, **sem avançar** e sem consumir o passo.

- `name`: 2-100 caracteres.
- `height`: normalizar `,`→`.` (DD10); aceitar metros (1,80) e centímetros (180) no mesmo campo;
  faixa 100-250 cm depois de normalizar.
- `weight`: normalizar `,`→`.`; faixa 30-300 kg.

- [ ] **Step 3: teclado numérico nos passos numéricos**

O `TextInput` é único para todos os passos (`ProfileSetupScreen.tsx:181-191`). Passar
`keyboardType={currentStep === 'height' || currentStep === 'weight' ? 'numeric' : 'default'}`.
Reduz a chance da entrada ruim na origem — **mas não substitui o Step 2**: o teclado numérico do
Android tem vírgula.

- [ ] **Step 4: propagar a causa real do erro**

O `catch` de `submitProfile` (`ProfileSetupScreen.tsx:137-139`) descarta a resposta do backend.
Ler `error.response.data.message` e mostrá-lo quando existir; cair na mensagem genérica só quando
não houver. Distinguir timeout/rede de erro de validação.

- [ ] **Step 5: guarda de reentrância**

`submitProfile` começa com `if (submitting) return;`. As opções somem via `!submitting`
(`ProfileSetupScreen.tsx:167`), mas isso depende do re-render — um toque duplo real pode disparar
duas chamadas.

- [ ] **Step 6: verificar**

Run: `cd app && ./node_modules/.bin/jest src/features/auth/screens/ProfileSetupScreen.test.tsx`
Expected: PASS, incluindo os testes A3 já existentes (ordem `profileSetup` → `setToken`).

---

### Task R2: timeout do upload de avatar

**Files:** Modify: `app/src/shared/services/profile.service.ts`,
`app/src/features/profile/screens/ProfileEditScreen.tsx`;
possivelmente `backend/src/modules/users/users.service.ts`

- [ ] **Step 1: confirmar a assimetria**

Run: `cd app && grep -n "timeout" src/shared/services/scanner.service.ts src/shared/services/profile.service.ts; grep -n API_TIMEOUT .env`
Expected: scanner com `{ timeout: 75000 }`, avatar sem override, `API_TIMEOUT=10000` — **mesmo
payload, mesmo `pickImage()`, 7,5× de diferença no orçamento de tempo.**

- [ ] **Step 2: igualar ao scanner (DD11)**

```ts
// app/src/shared/services/profile.service.ts
uploadAvatar: (image: string) =>
  // Mesmo payload do scanner (pickImage: base64, 1024px, q0.8) e mais trabalho de
  // servidor por request: Storage + getPublicUrl + UPDATE + list + remove. Os 10s
  // do API_TIMEOUT não bastam — o scanner já tinha subido para 75s pelo mesmo motivo.
  api.post<BackendProfile>('/users/me/avatar', { image }, { timeout: 75000 })
     .then((r) => r.data),
```

- [ ] **Step 3: tirar a limpeza das fotos antigas do caminho crítico**

`users.service.ts:112-122` faz `storage.list()` + `storage.remove()` **dentro** do request, depois
do avatar já estar salvo. É best-effort e não deve consumir o orçamento de tempo do usuário.
Responder assim que o `UPDATE profiles` concluir e fazer a limpeza depois.

- [ ] **Step 4: mensagem honesta no erro**

`ProfileEditScreen.tsx:82-84` engole tudo num alerta só. Separar timeout/rede de 502
(`UPLOAD_FAILED`) e de 422 (`INVALID_IMAGE`).

- [ ] **Step 5: ⚠️ APARELHO**

Enviar foto da galeria no tablet Android, em rede móvel (não WiFi — é o pior caso), com a função
fria. Expected: conclui e o avatar aparece.

---

### Task R3: açúcar (e fibra e sódio) do banco até a tela

**Files:** Modify: `backend/src/modules/food-log/*`, `app/src/shared/services/food-log.service.ts`,
`app/src/features/food-log/components/FoodLogItem.tsx`,
`app/src/features/dashboard/screens/DashboardScreen.tsx`

> **⚠️ Confirmar o alvo com o cliente antes de começar** — ver §9.1 da spec. O plano assume a
> leitura A (Diário + Dashboard).

- [ ] **Step 1: confirmar que o dado já existe e onde ele morre**

Run: `cd /Users/…/CalorIA && grep -n "sugar_g\|fiber_g\|sodium_mg" backend/supabase/migrations/002_foods.sql && grep -rn "sugar" app/src backend/src | grep -v test`
Expected: as três colunas existem na migração; **nenhuma** ocorrência em `app/src` nem nas rotas.
Não é coleta nova — é encanamento.

- [ ] **Step 2: expor no backend**

`sugar_g`, `fiber_g` e `sodium_mg` no SELECT e no schema de resposta das refeições. Nulos são
legítimos (nem todo alimento tem o dado) — o contrato precisa ser `number | null`.

- [ ] **Step 3: tipo do app**

`Meal` (`food-log.service.ts:6-15`) ganha `sugar`, `fiber` e `sodium` como `number | null`.
As fixtures de teste desatualizadas da Task X1c vão precisar acompanhar.

- [ ] **Step 4: UI**

`FoodLogItem.tsx:34` passa a listar açúcar; campo sem dado é **omitido**, nunca exibido como `0g`
(seria mentira). Card de macros do Dashboard idem.

- [ ] **Step 5: verificar**

Run: `cd app && ./node_modules/.bin/jest src/features/food-log` e testes do backend
Expected: verdes, com caso de `sugar: null`.

---

### Task R5: o Dashboard para de inventar metas

**Files:** Modify: `app/src/features/dashboard/screens/DashboardScreen.tsx`,
`app/src/shared/utils/calories.ts`

**Depende de:** nada. Mas só faz sentido junto com R6 — são a mesma cadeia.

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -n "DEFAULT_CALORIE_GOAL\|DEFAULT_PROTEIN_GOAL\|DEFAULT_CARBS_GOAL\|DEFAULT_FAT_GOAL" src/shared/utils/calories.ts src/features/dashboard/screens/DashboardScreen.tsx`
Expected: `2000`, `150`, `250`, `65` — exatamente os números do print do cliente. São constantes
do cliente, não vieram do servidor.

- [ ] **Step 2: estado vazio honesto (DD12)**

Sem plano (`plan` nulo ou `totalCalories === 0`): card de metas vira estado explícito —
"Ainda não temos suas metas. Converse com o Coach para gerar sua dieta" + CTA. **Deletar** as
quatro constantes; `getDailyCalorieGoal` retorna `number | null`.

- [ ] **Step 3: teste**

Dashboard sem plano **não** renderiza `2000`, `150`, `250` nem `65`, e renderiza o CTA.

- [ ] **Step 4: verificar**

Run: `cd app && ./node_modules/.bin/jest src/features/dashboard src/shared/utils/calories.test.ts`
Expected: verde. (`calories.test.ts` vai precisar acompanhar a mudança de contrato.)

---

### Task R6: re-gate de perfil incompleto

**Files:** Modify: `app/src/navigation/RootNavigator.tsx`, `app/src/features/auth/store.ts`

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -n "showAuthenticatedApp" src/navigation/RootNavigator.tsx`
Expected: `isAuthenticated || isAppPreviewEnabled()` — **nenhuma** checagem de perfil.
Quem trava no R1, fecha o app e faz login entra direto no Dashboard sem altura/peso/objetivo.
Sem esses campos `jobs.service.ts:39` não calcula o gasto basal → nunca há dieta → o R5 preenche
com números falsos. **R1 → R6 → R5 é uma cadeia só, e é o estado do print 1.**

- [ ] **Step 2: expor a completude do perfil**

O `/users/me` já devolve `height_cm` e `weight_kg`. Derivar `isProfileComplete` no store de auth
(altura **e** peso **e** objetivo presentes).

- [ ] **Step 3: gate na navegação**

`showAuthenticatedApp = isAuthenticated && isProfileComplete`. Incompleto → `ProfileSetup`.

**Cuidado:** o perfil só é conhecido depois de uma chamada ao servidor. Enquanto for
`undefined` (indeterminado), **manter o splash** — mandar para o onboarding por engano jogaria
usuário legítimo de volta para o começo. Falha de rede na checagem → tratar como completo (não
prender ninguém fora do app por estar offline).

- [ ] **Step 4: testes**

Perfil completo → Dashboard. Incompleto → ProfileSetup. Indeterminado → splash.
Erro de rede → Dashboard.

---

### Task R7: layout de tablet nas 20 telas restantes

**Files:** Add: `app/src/shared/components/ScreenShell.tsx`; Modify: as 20 telas sem `maxWidth`

- [ ] **Step 1: medir**

Run: `cd app && grep -rln "maxWidth" src --include="*.tsx" | grep -i screen; find src/features -name "*Screen.tsx" | grep -v test | wc -l`
Expected: 5 telas limitam, 25 no total. Nenhum `useWindowDimensions`, nenhum breakpoint no app.

- [ ] **Step 2: extrair o padrão que já existe (DD14)**

Dashboard (`DashboardScreen.tsx:215`) e Diário (`FoodLogScreen.tsx:145`) já usam
`{ width: '100%', maxWidth: 760, alignSelf: 'center' }`. Virar `ScreenShell` e reusar os dois nele
— não inventar breakpoint novo.

- [ ] **Step 3: aplicar**

Começar por **Editar perfil** (a tela dos prints 2 e 3), depois Coach, Comunidade, Desafios,
Perfil, Evolução, Scanner e as demais.

- [ ] **Step 4: ⚠️ APARELHO**

Tablet em **paisagem e retrato**. Expected: conteúdo centralizado com largura confortável em todas
as 25; nada esticado de ponta a ponta.

---

## Fase 3 — Android (bloco N)

### Task N1: fixar o tema nativo em claro

**Files:** Modify: `app/android/app/src/main/res/values/styles.xml`;
Add: `app/android/app/src/main/res/values/colors.xml`

- [ ] **Step 1: reproduzir**

Run: `cd app && grep -n "parent=" android/app/src/main/res/values/styles.xml; ls android/app/src/main/res/values-night 2>&1; grep -rn "useColorScheme\|Appearance" src/theme/`
Expected: parent `Theme.AppCompat.DayNight.NoActionBar`; `values-night` não existe; nenhum suporte
a dark no tema JS. Ou seja: o nativo troca para escuro, a UI não.

- [ ] **Step 2: ⚠️ APARELHO — ver o sintoma antes de corrigir**

Emulador/aparelho **em modo escuro**: abrir o app, disparar um `Alert.alert`, focar um `TextInput`.
Registrar aqui o que aparece escuro. **Se nada aparecer escuro, parar e reportar** — a hipótese
estava errada e a correção não deve entrar sem sintoma.

- [ ] **Step 3: corrigir**

`colors.xml` com `<color name="brand_background">#FAF8F4</color>`; `styles.xml` com parent
`Theme.AppCompat.Light.NoActionBar` e
`<item name="android:windowBackground">@color/brand_background</item>`.

- [ ] **Step 4: ⚠️ APARELHO — reverificar**

Repetir o Step 2. Expected: nada escuro.

---

### Task N2: smoke test de release com R8

**Files:** possivelmente `app/android/app/proguard-rules.pro` (só se crashar)

**Contexto:** `minifyEnabled true` (`build.gradle:64`) com keep rules mínimas, e **nenhuma** das
quatro libs autolinkadas traz consumer rules (verificado em `node_modules`). R8 quebra em runtime,
nunca no build — e não há registro de smoke test após o upgrade para RN 0.85.3 (`8d8ad65`/`8a39c45`).

- [ ] **Step 1: ⚠️ APARELHO — build assinado**

Run: `cd app/android && ./gradlew bundleRelease` (requer as 4 propriedades `CALORIA_UPLOAD_*` em
`~/.gradle/gradle.properties`)
Expected: `app/build/outputs/bundle/release/app-release.aab`

- [ ] **Step 2: ⚠️ APARELHO — instalar e percorrer**

Instalar no aparelho e rodar o roteiro do `docs/mobile-hardening.md` §6:
login → dashboard → scanner (câmera **e** galeria) → diário → dieta → desafios (check-in) →
feed (post + comentário) → perfil (editar, evolução) → logout.

Com `adb logcat` capturando o tempo todo.

- [ ] **Step 3: registrar o resultado — inclusive se passar**

Colar aqui o veredito. **Se passou limpo, escrever isso explicitamente**: é a informação que hoje
falta no repositório e a razão de N2 existir.

- [ ] **Step 4: keep rule SÓ se crashar (DD5)**

Se houver crash: pegar a classe do stack trace do `logcat`, adicionar a keep rule **mínima** que
resolve, colar o stack trace na mensagem do commit, repetir os Steps 1-2.
**Proibido** adicionar regra preventiva: incha o dex e esconde o problema real.

---

### Task N3: teclado no `ProfileSetupScreen`

**Files:** Modify: `app/src/features/auth/screens/ProfileSetupScreen.tsx`

- [ ] **Step 1: mostrar que é o ponto fora da curva**

Run: `cd app && grep -rn "behavior={Platform.OS" src`
Expected: 5 telas — quatro com `: undefined` e **só** `ProfileSetupScreen.tsx:152` com `: 'height'`.
O manifest já usa `windowSoftInputMode="adjustResize"` (`AndroidManifest.xml:20`), que sozinho já
encolhe a janela; o `behavior="height"` encolhe de novo por cima.

- [ ] **Step 2: ⚠️ APARELHO — ver o sintoma**

Android: abrir o onboarding, focar um campo, observar salto/encolhimento e se o botão de avançar
some em tela pequena. Registrar.

- [ ] **Step 3: alinhar**

`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — igual às outras quatro telas.

- [ ] **Step 4: ⚠️ APARELHO — reverificar**

iOS **e** Android: focar cada campo do onboarding; o botão de avançar continua alcançável nos dois.

---

### Task N4: confirmação de descarte nos formulários

**Files:** Modify: `app/src/features/feed/screens/CreatePostScreen.tsx`,
`app/src/features/challenges/screens/CreateChallengeScreen.tsx`,
`app/src/features/profile/screens/ProfileEditScreen.tsx`

- [ ] **Step 1: confirmar a lacuna**

Run: `cd app && grep -rn "BackHandler\|beforeRemove\|usePreventRemove" src`
Expected: vazio — nada trata o voltar do Android em lugar nenhum.

- [ ] **Step 2: implementar**

`usePreventRemove` (ou o listener `beforeRemove`) do React Navigation nas três telas: quando há
conteúdo digitado, perguntar antes de sair. **Uma implementação cobre botão do Android, gesto de
voltar do iOS e seta do header** — por isso é a abordagem escolhida em vez de `BackHandler` cru.

- [ ] **Step 3: testes**

Unit por tela: com campo preenchido, a tentativa de sair dispara o diálogo e **não** navega;
com campos vazios, sai direto.

- [ ] **Step 4: ⚠️ APARELHO**

Android: digitar e apertar o voltar do sistema nas três telas.
Expected: diálogo de confirmação; "Descartar" sai, "Continuar editando" fica.

> **Escopo (DD7):** só isso. Predictive back do Android 16 e política global de saída do app são
> spec própria.

---

## Fase 4 — Fechamento

### Task F1: verificação final

**REQUIRED SUB-SKILL:** `superpowers:verification-before-completion` — evidência antes de
afirmação, sempre.

- [ ] **Step 1: os três loops**

Run: `cd app && npm run lint && npm run type-check && npm test && npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/verify.jsbundle`
Expected: os quatro verdes.

- [ ] **Step 2: os 24 critérios de aceite da spec**

Percorrer §7 da spec um a um. Os itens 10-15, 19 e 23 são **⚠️ APARELHO** e precisam da saída do humano
colada. Item não verificado é item **não** marcado.

- [ ] **Step 3: nada de instrumentação sobrou**

Run: `cd /Users/…/CalorIA && grep -rn "\[DEBUG-" app/src backend/src`
Expected: vazio.

- [ ] **Step 4: PR**

Descrição com: a hipótese confirmada de cada achado (exigência da Fase 6 da skill de diagnóstico),
o antes/depois do `tsc` (27 → 0) e do `jest` (4 falhas → 0), o veredito do smoke test de R8, e o
número do build reenviado à Apple.

---

## Ordem de execução recomendada

```
AP0  ──────────────────────────────►  (humano, HOJE, independente de tudo)
R1   ──────────────────────────────►  (mais urgente do bloco técnico: trava cadastro novo)

X3 → X1a → X1b → X1c → X2 → X4       (baseline + gate; X4 depende de todos os anteriores)
                    │
AP1 → AP2 → AP3 ────┤                 (backend; paralelo à trilha X)
I1, I2, I3, I4+I5 ──┤                 (iOS; folhas, paralelizáveis)
R1 → R6 → R5 ───────┤                 (cadeia única: sem perfil → sem dieta → metas falsas)
R2, R3, R7 ─────────┤                 (folhas; R3 espera a confirmação da §9.1 da spec)
I6+N5, N1, N3, N4 ──┤                 (Android + nome; folhas)
N2 ─────────────────┘                 (por último: precisa do código todo para o smoke valer)
                    │
                    └──► F1
```

**R1 antes de tudo que for técnico.** Enquanto ele estiver de pé, todo usuário novo que digitar a
altura com vírgula fica preso no onboarding — inclusive o revisor da Apple, se resolver criar a
própria conta em vez de usar a demo.

**R4 (áudio no Coach) não está aqui de propósito:** é feature nova, movida para spec própria
(DD13). Ver §8 da spec.

**N2 é sempre a última tarefa técnica.** Um smoke test de release feito antes das outras
correções teria que ser refeito.

---
