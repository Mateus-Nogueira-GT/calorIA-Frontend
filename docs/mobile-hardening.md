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

- ⚠️ **`targetSdkVersion` está em 36 / Android 16 (item 7)** — exigência da
  Play, que **já mudou duas vezes** durante a publicação deste app: confirme a
  régua vigente no console antes de gerar o `.aab`. O bump está aplicado, mas o
  edge-to-edge que ele força ainda **não foi verificado em device**: rodar a
  checagem visual do item 7 junto com o smoke test abaixo antes de promover
  para produção.
- **applicationId:** `br.com.caloriaoficial.app` — **imutável após a 1ª publicação**.
  O `namespace` do Gradle segue `com.caloria` (pacote das classes Java/R); são
  campos diferentes e podem divergir sem problema.
- **Keystore de upload:** `app/android/app/caloria-upload.keystore`
  (alias `caloria-upload`, válido até 2053). **Não está no git** (`.gitignore`).
  As credenciais ficam em `~/.gradle/gradle.properties` (chmod 600).
  ⚠️ Faça backup do arquivo + senha num gerenciador: sem eles não há como
  publicar atualizações (com Play App Signing dá para resetar a upload key).
- **`versionCode` precisa ser incrementado a cada upload** (atual: 6 — próximo upload usa 7).
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

## 7. `targetSdkVersion = 36` — aplicado, verificação visual pendente

`app/android/build.gradle` está em `compileSdkVersion = 36` e
`targetSdkVersion = 36` (Android 16). **A mudança de código está feita; o que
continua em aberto é a verificação visual do edge-to-edge** descrita abaixo.

**A régua do Play se move — confirme sempre no console.** O requisito é que o
target API esteja no máximo **um ano atrás** da versão mais recente do
Android. Este app já foi recusado duas vezes por isso: primeiro com
`targetSdk 34` (o console pedia 35), depois com `targetSdk 35` (o console
passou a pedir 36, com a mensagem "O app precisa segmentar Android 16 (nível
36 da API) ou mais recentes"). Como o app **nunca foi publicado com sucesso**,
ele é enviado como **app novo**, e a exigência vale de imediato.

**Toolchain:** `compileSdk` precisa ser >= `targetSdk`. O AGP fixado pelo RN
(8.7.2 na 0.77.3) não foi testado com `compileSdk 36` e emite o aviso
`We recommend using a newer Android Gradle plugin to use compileSdk = 36` a
cada build. **O aviso é esperado e foi deixado à vista de propósito** — ele só
encerra com AGP >= 8.9; a migração para o RN 0.77 (item 8) **não** o eliminou,
ao contrário do que se previa. Não suprimir com
`android.suppressUnsupportedCompileSdk` sem revalidar o release.
A plataforma `android-36` do SDK é baixada automaticamente pelo Gradle na
primeira build (as licenças já estão aceitas em `~/Library/Android/sdk/licenses`).

**O que o bump traz junto:** apps com `targetSdkVersion = 36` têm
**edge-to-edge forçado pelo Android 15/16 sem opt-out** — a UI desenha atrás
das barras de sistema por padrão, o que muda como os window insets chegam em
toda a árvore (no Android 16 a escotilha de saída
`windowOptOutEdgeToEdgeEnforcement` deixa de valer). O app depende de
`react-native-safe-area-context` — 13 das 37 telas o usam diretamente, o resto
herda os insets dos headers/tab bar do React Navigation — mas isso **não foi
verificado em device**: nenhum emulador ou aparelho estava disponível.

Um segundo efeito do API 36 **não se aplica aqui**: restrições de orientação e
redimensionamento passam a ser ignoradas em telas grandes (>600dp). O
`AndroidManifest.xml` não declara `screenOrientation` nem `resizeableActivity`,
então não há nada que o sistema vá passar por cima.

**O que falta verificar (antes de promover para produção):**
1. Header, tab bar e qualquer UI com `position: absolute` perto do topo ou
   do rodapé (overlays do scanner, toasts) — não podem ficar sob a barra de
   status nem sob a barra de navegação.
2. Teclado abrindo sobre inputs perto do rodapé (o `AddMealModal` é o caso
   mais sensível).
3. iOS e Android, tema claro e escuro.
4. O smoke test de release do item 6 inteiro, na mesma passada.

Se aparecer sobreposição, o ajuste é local (`useSafeAreaInsets` no
componente afetado), não uma reversão do `targetSdk` — baixar o target
reintroduz a rejeição na Play.

## 8. Páginas de 16 KB — resolvido com a migração para RN 0.77.3 (Workstream O)

O Play recusa o `.aab` com *"Seu app não é compatível com tamanhos de página de
16 KB de memória"*. Desde 01/11/2025 o Google exige que apps que segmentam
Android 15+ funcionem em aparelhos com página de memória de 16 KB — e este app
segmenta 36.

**Medição (não é suposição).** Todas as 13 bibliotecas nativas do `.aab` têm
segmentos `LOAD` alinhados em `0x1000` (4 KB); o exigido é `0x4000` (16 KB).
Para reproduzir:

```bash
R="$ANDROID_HOME/ndk/26.1.10909125/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf"
unzip -q -o app-release.aab 'base/lib/arm64-v8a/*'
for f in base/lib/arm64-v8a/*.so; do
  echo "$f: $("$R" -l "$f" | awk '/LOAD/ {print $NF}' | sort -u)"
done
```

**Por que não dá para corrigir por configuração.** Só 4 das 13 libs são
compiladas aqui (`libappmodules`, `librnscreens`, `libreact_codegen_*`) — essas
um NDK r27+ resolveria. As outras 9 (`libreactnative`, `libhermes`,
`libhermestooling`, `libjsi`, `libfbjni`, `libc++_shared`, e as três do Fresco)
vêm **prontas dentro dos AARs**. Confirmado na origem: o
`libreactnative.so` dentro de
`~/.gradle/caches/.../react-android/0.76.9/react-android-0.76.9-release.aar`
já vem em `0x1000`. Nenhuma flag de build local altera um binário pré-compilado.

**O caminho é atualizar o React Native.** O suporte a 16 KB entrou no
**RN 0.77**; a 0.76.x não recebeu backport. O projeto está em **0.76.9**.

**Atenção ao planejar:** é migração, não bump. A superfície inclui a New
Architecture, os 4 pacotes nativos autolinkados e o toolchain inteiro (Gradle,
AGP, Kotlin, NDK). Merece spec e plano próprios, e o smoke test dos itens 6 e 7
roda depois — não antes.

### Resolução (12/08/2026, Workstream O)

Migrado para **RN 0.77.3** + **NDK 27.1.12297006** + **Kotlin 2.0.21**, com
`react-native-screens` **4.12.0**. Auditoria do `.aab` v6: **as 13 libs, nas
duas ABIs de 64 bits (`arm64-v8a` e `x86_64`), em `0x4000`** — inclusive as três
do Fresco, que eram o risco em aberto. O comando de medição acima continua
válido para auditar releases futuros.

**Por que o screens ficou em 4.12.0 e não numa 4.13+.** A 4.13.1 introduziu os
módulos `fabric/BottomTabs*` e `fabric/gamma/*`, cujo codegen o
`@react-native/babel-plugin-codegen` do RN 0.77 não parseia
(`Could not find component config for native component`). O efeito é
**exclusivo do build web**: o Metro empacota os mesmos arquivos sem reclamar, e
o `npm run build:web` falha com 6 erros. Verificado que não é o alias
`react-native → react-native-web` do webpack — removê-lo não muda nada — e que
os módulos culpados entram exatamente na 4.13.1 (as versões 4.5.0–4.12.0 não os
têm). Ao subir o screens, rodar `npm run build:web` antes de assumir sucesso: o
build Android sozinho não detecta essa classe de quebra.

**Duas correções de expectativa que esta migração produziu:**

- O aviso do AGP (item 7) **não** sumiu: o RN 0.77 fixa AGP **8.7.2**, e o aviso
  só encerra com AGP >= 8.9. Fica para um upgrade futuro do RN.
- O AsyncStorage segue na série 2.x, mas agora **por escolha** (a API da 3.x é
  equivalente), não por incompatibilidade — o Kotlin 2.0.21 destravou isso.

**Nota de auditoria:** no `usage.txt`, o R8 lista `PackageList` como parcialmente
removido — são apenas o construtor sobrecarregado e os campos `mConfig`/
`application`, não usados. A classe e o `getPackages()` sobrevivem (conferir no
`mapping.txt`), e os 4 pacotes autolinkados continuam registrados. Ver
`PackageList` no `usage.txt` **não** indica autolinking quebrado.
