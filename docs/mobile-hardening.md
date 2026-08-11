# Hardening mobile — dívidas documentadas

Itens conhecidos que **não** foram implementados no Workstream L por exigirem
dependências nativas, credenciais ou migração de dados. Registrados aqui para
não virarem conhecimento tácito.

## 1. Tokens no Keychain / Keystore (pendente)

Hoje `access_token` e `refresh_token` ficam em **AsyncStorage, em texto puro**
(chave `caloria:auth`, via `kvStorage` + `zustand/persist`).

Em device comprometido (root/jailbreak) ou backup não criptografado, esses
tokens são legíveis. O padrão de mercado é o cofre do SO.

**Como migrar:**
1. `npm i react-native-keychain` + `pod install`.
2. Criar um `StateStorage` alternativo em `src/shared/services/storage.ts`
   que use `Keychain.setGenericPassword` / `getGenericPassword`.
3. Apontar **apenas** o store de auth (`caloria:auth`) para ele — o resto
   (preferências, coach) pode continuar no AsyncStorage.
4. **Migração de sessão:** na primeira execução, ler do AsyncStorage,
   regravar no Keychain e apagar a chave antiga. Sem isso, todo usuário
   logado é deslogado no update.

## 2. Crash reporting (pendente)

Nenhum Sentry/Crashlytics: crashes de produção são **invisíveis** — só
descobrimos por reclamação de usuário.

O ponto de integração já existe e está isolado: o `componentDidCatch` de
[`AppErrorBoundary`](../app/src/shared/components/AppErrorBoundary.tsx) hoje só
faz `console.error`. Plugar `@sentry/react-native` ali cobre erros de render;
para erros nativos e promises não tratadas, o SDK precisa também do init no
`index.js`.

## 3. Pods do iOS

Toda dependência nativa nova (o AsyncStorage do Workstream C incluído) exige:

```bash
cd app/ios && bundle install && bundle exec pod install
```

Sem isso o build do iOS falha com "module not found" no Xcode.

## 4. Limitações conhecidas no web

- **Diálogos de confirmação** (sair da conta, remover amizade) usam
  `Alert.alert` com array de botões, que é **no-op no react-native-web**.
  O util [`showAlert`](../app/src/shared/utils/show-alert.ts) cobre só os
  avisos de 1 botão; trocar os de confirmação exigiria adaptar o contrato de
  callbacks para `window.confirm`. Hoje esses fluxos funcionam apenas no mobile.
- **Scanner**: o envio de foto no app nativo usa o image-picker; no web há um
  seletor próprio (`ScannerViewfinder`).

## 5. Universal / App Links (follow-up do Workstream K)

O scheme `caloria://` está registrado nas duas plataformas, mas links **https**
ainda não abrem o app. Para isso:

- iOS: hospedar `apple-app-site-association` em `https://<domínio>/.well-known/`
  + capability Associated Domains (`applinks:<domínio>`).
- Android: hospedar `assetlinks.json` em `/.well-known/` + `android:autoVerify="true"`
  no intent-filter, com o SHA-256 do certificado de assinatura.

Depende de ter um domínio próprio apontado para o deploy (o
`APP_WEB_URL` do `.env` deve refletir esse domínio).

## 6. Publicação Android (Play Store)

- ⚠️ **`targetSdkVersion` está em 35 (item 7)** — exigência da Play para apps
  novos. O bump já foi aplicado, mas o edge-to-edge que ele força no Android 15
  ainda **não foi verificado em device**: rodar a checagem visual do item 7
  junto com o smoke test abaixo antes de promover para produção.
- **applicationId:** `br.com.caloriaoficial.app` — **imutável após a 1ª publicação**.
  O `namespace` do Gradle segue `com.caloria` (pacote das classes Java/R); são
  campos diferentes e podem divergir sem problema.
- **Keystore de upload:** `app/android/app/caloria-upload.keystore`
  (alias `caloria-upload`, válido até 2053). **Não está no git** (`.gitignore`).
  As credenciais ficam em `~/.gradle/gradle.properties` (chmod 600).
  ⚠️ Faça backup do arquivo + senha num gerenciador: sem eles não há como
  publicar atualizações (com Play App Signing dá para resetar a upload key).
- **`versionCode` precisa ser incrementado a cada upload** (atual: 3 — próximo upload usa 4).
- **Toolchain local:** JDK 17 (`/opt/homebrew/opt/openjdk@17`), Android SDK em
  `~/Library/Android/sdk` (platform 35, build-tools 35.0.0, NDK 26.1.10909125).
- **`@react-native-community/cli` é obrigatório** como devDependency: o Gradle
  o invoca em `createBundleReleaseJsAndAssets`; sem ele o build de release
  falha com "Process 'command 'node'' finished with non-zero exit value 1".
- **O `.env` é lido no momento do build** (react-native-dotenv inlineia os
  valores no bundle). Antes de gerar um `.aab` de produção, confirme:
  `API_BASE_URL=https://calor-ia-frontend.vercel.app/api` (https obrigatório —
  o Android 9+ bloqueia cleartext e o app não tem exceção configurada).
- **R8 está ATIVO** (`enableProguardInReleaseBuilds = true` + `shrinkResources`):
  o dex é minificado/ofuscado e o `mapping.txt` de desofuscação vai **embutido
  no próprio .aab** (`BUNDLE-METADATA/.../proguard.map`) — não precisa subir
  separado no Play Console. Mas a cópia local não é permanente, ver abaixo.
- **Smoke test de release é obrigatório antes de todo upload**: R8 quebra em
  runtime (reflection), não em build. Roteiro: abrir app → login → dashboard →
  registrar refeição → scanner → deep link `caloria://` → logout
  (`npx react-native run-android --mode release`). Crash de R8 aparece no
  logcat como ClassNotFoundException/NoSuchMethodError → keep rule específica
  em `proguard-rules.pro`.
- **Logs em release**: `console.log/debug/info` são removidos pelo Babel
  (bloco `env.production` do `app/babel.config.js`) — isso vale para o release
  Android **e também para o build web de produção**, já que o `babel-loader`
  do `app/web/webpack.config.js` não passa `configFile: false` e portanto
  herda o mesmo `babel.config.js`, e o Vercel builda com `NODE_ENV=production`.
  Na prática, hoje isso não remove nenhum log próprio: `app/src` tem exatamente
  um `console.*` (o `console.error` do `AppErrorBoundary`, deixado de propósito
  fora do strip); tudo que a regra remove hoje vem de `node_modules` — é defesa
  contra log futuro, não limpeza de log existente.
- **Release sem `API_BASE_URL` no .env agora LANÇA na inicialização**
  (fail-fast) em vez de apontar silenciosamente para localhost. Além disso, o
  `bundleRelease` tem uma checagem em build-time (task `verifyReleaseApiBaseUrl`
  em `app/android/app/build.gradle`, só para release): sem uma linha ATIVA
  (não comentada) `API_BASE_URL=https://...` no `app/.env`, o Gradle falha
  antes de empacotar o JS, com mensagem acionável — a máquina de build pega o
  problema antes do device.
- **`mapping.txt` (desofuscação do R8) some no próximo build**: ele vai
  embutido no `.aab` (`BUNDLE-METADATA/.../proguard.map`), mas o arquivo local
  `app/android/app/build/outputs/mapping/release/mapping.txt` não é
  versionado — o próximo `bundleRelease` sobrescreve. Depois disso, o `.aab`
  já enviado é a única cópia. Recomenda-se arquivar esse arquivo por
  `versionCode` (ex.: copiar para `mapping-v<N>.txt` num local fora do
  `.gitignore` antes de subir a próxima versão).

### Comando

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd app/android && ./gradlew bundleRelease
# saída: app/build/outputs/bundle/release/app-release.aab
```

## 7. `targetSdkVersion = 35` — aplicado, verificação visual pendente

`app/android/build.gradle:6` está em `targetSdkVersion = 35`, alinhado ao
`compileSdkVersion`. **A mudança de código está feita; o que continua em
aberto é a verificação visual do edge-to-edge** descrita abaixo.

Por que foi necessária: a Google Play exige **API 35** para apps novos e
atualizações a partir de 31/08/2025 (**confirmar a exigência vigente no Play
Console** — essa data não deve ser tomada como definitiva). Como este app
**nunca foi publicado com sucesso** (os `versionCode` 1 e 2 foram consumidos
por tentativas rejeitadas — ver item 6), ele é enviado como **app novo**. Com
`targetSdk 34` o upload seria rejeitado só pelo target API, independente de
todo o trabalho de R8 do Workstream N.

**O que o bump traz junto:** apps com `targetSdkVersion = 35` têm
**edge-to-edge forçado pelo Android 15** — a UI passa a desenhar atrás das
barras de sistema por padrão (deixa de ser opt-in), o que muda como os window
insets chegam em toda a árvore. O app depende de
`react-native-safe-area-context`, que deve absorver a maior parte, mas isso
**não foi verificado em device** — nenhum emulador ou aparelho estava
disponível quando a mudança foi feita.

**O que falta verificar (antes de promover para produção):**
1. Header, tab bar e qualquer UI com `position: absolute` perto do topo ou
   do rodapé (overlays do scanner, toasts) — não podem ficar sob a barra de
   status nem sob a barra de navegação.
2. Teclado abrindo sobre inputs perto do rodapé (o `AddMealModal` é o caso
   mais sensível).
3. iOS e Android, tema claro e escuro.
4. O smoke test de release do item 6 inteiro, na mesma passada.

Se aparecer sobreposição, o ajuste é local (`useSafeAreaInsets` no
componente afetado), não uma reversão do `targetSdk` — voltar para 34
reintroduz a rejeição na Play.
