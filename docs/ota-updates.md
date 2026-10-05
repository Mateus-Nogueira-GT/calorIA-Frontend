# Atualizações OTA (EAS Update)

O app recebe atualizações de JavaScript pela internet, sem passar pela loja.
Implementado com `expo-updates` (Expo SDK 56, par exato do React Native 0.85.3)
sobre o projeto React Native puro — não é um app "Expo managed".

## Como funciona no dia a dia

1. Merge na `main`.
2. O workflow **CI** roda (type-check, testes, bundle).
3. Se passou, o workflow **OTA update** (`.github/workflows/ota-update.yml`)
   publica o commit aprovado no canal `production`.
4. O app baixa a atualização em segundo plano ao abrir; ela entra em vigor na
   **próxima** abertura (`EXPO_UPDATES_LAUNCH_WAIT_MS = 0`: nunca segura a
   abertura esperando a rede).

Publicar na mão (do diretório `app/`, com `.env` de produção):

```bash
eas update --channel production --environment production --message "o que mudou"
```

Ou pela aba **Actions → OTA update → Run workflow** no GitHub.

## O que vai por OTA e o que exige build de loja

| Vai por OTA | Exige build novo (EAS Build + envio à loja) |
|---|---|
| Qualquer coisa em `app/src/` (telas, textos, lógica, estilos) | Biblioteca com código nativo (`npm install` de lib com `android/`/`ios/`) |
| Imagens importadas pelo JS | Permissão nova (câmera, microfone, localização...) |
| Chamadas à API | Ícone, splash, nome do app, `app.json` nativo |
| | Qualquer arquivo em `app/android/` ou `app/ios/` |
| | Upgrade do React Native ou do Expo |

**Proteção automática (fingerprint):** `runtimeVersion` usa
`{ "policy": "fingerprint" }`. Cada build grava um hash do código nativo, e cada
OTA é publicado com o hash do commit. O OTA **só é entregue a builds com o mesmo
hash**. Se você mexer em algo nativo e der merge, o OTA sai com um hash que
nenhum build instalado tem — ninguém recebe, nada quebra — e é o sinal de que
é hora de um build de loja.

Para saber se um commit mudou o nativo:

```bash
npx expo-updates fingerprint:generate --platform android
```

Compare com o fingerprint do último build no painel do EAS (Builds → detalhes).

## Voltar atrás (rollback)

Se um OTA der problema:

```bash
eas update:rollback
```

O comando é interativo: escolhe o canal e a atualização anterior, que volta a
ser a vigente. Os aparelhos pegam a versão anterior na próxima abertura.

## Canais

`eas.json` liga cada perfil de build a um canal: `development`, `preview`,
`production`. Um build de `preview` (instalação interna) só recebe OTAs de
`preview` — use para testar no seu aparelho antes de publicar em `production`:

```bash
eas update --channel preview --environment preview --message "teste"
```

## Configuração que precisa existir

- **Secret `EXPO_TOKEN` no GitHub** (Settings → Secrets and variables →
  Actions). Gerar em expo.dev → Account settings → Access tokens. Sem ele o
  workflow falha no passo `expo-github-action`.
- **Variáveis no EAS**, ambiente `production`: `API_BASE_URL`, `API_TIMEOUT`,
  `APP_WEB_URL` (as mesmas do build). O workflow as puxa para o `.env` com
  `eas env:pull`, porque o `@env` é resolvido pelo `react-native-dotenv` na
  hora do bundle.

## Regras das lojas

Google Play e App Store permitem atualizar JavaScript por OTA desde que a
atualização **não mude o propósito do app** nem contorne a revisão com
funcionalidade nova significativa. Correções, textos e ajustes de tela estão
dentro. Feature grande → build de loja com revisão.

## Pontos de atenção

- **iOS mínimo subiu de 15.1 para 16.4** (exigência do Expo SDK 56). Aparelhos
  em iOS 15 / 16.0–16.3 deixam de receber builds novos da loja.
- `Expo.plist` precisa estar em *Copy Bundle Resources* do target `calorIA`
  (`project.pbxproj`). O `eas update:configure` cria o arquivo mas **não** o
  adiciona ao projeto do Xcode — sem ele o OTA fica desligado no iOS.
- **O `install-expo-modules` gera código de SDK antigo.** Ele escreveu
  `ReactNativeHostWrapper` no `MainApplication.kt` e `EXAppDelegateWrapper` no
  `AppDelegate`, e nenhum dos dois existe no SDK 56 — o Android quebrava em
  `compileDebugKotlin` e o iOS quebraria igual. Os dois arquivos foram
  reescritos a partir do `expo-template-bare-minimum@56`: `MainApplication.kt`
  só com `ReactHost` via `ExpoReactHostFactory`, e o iOS migrou de
  `AppDelegate.h/.mm` + `main.m` (Objective-C) para `AppDelegate.swift` com
  `ExpoReactNativeFactory`. É essa factory que deixa o expo-updates trocar o
  bundle embutido pelo OTA — com o `RCTAppDelegate` antigo o iOS ignoraria os
  OTAs em silêncio.
- **Fingerprint de build local pode divergir.** A tarefa do Gradle calcula o
  fingerprint no meio do build; no PRIMEIRO build local (pastas sendo geradas)
  o valor gravado no APK saiu diferente do calculado depois. Com o projeto
  parado, build e `eas update` dão o mesmo hash. No EAS o fingerprint é
  calculado antes do build, numa cópia limpa. **Conferir no primeiro build de
  loja:** o *Runtime version* mostrado na página do build no EAS deve ser igual
  ao de `npx expo-updates fingerprint:generate --platform android` (e `ios`)
  rodado na mesma revisão.
- **`AndroidManifest.xml` e `strings.xml` ficam no formato do `eas build`.**
  Antes de cada build o `eas build` reescreve os dois (sincroniza a config do
  expo-updates) — e apaga comentários. O fingerprint do Android inclui esses
  arquivos: se o git guardar outra formatação, o build sai com um hash e o
  workflow de OTA (que lê o git) calcula outro, e os OTAs nunca chegam. Por
  isso os dois estão commitados exatamente como a ferramenta gera. **Não
  reformate nem comente esses arquivos à mão.** Se `git status` mostrar os dois
  modificados depois de um `eas build`, commite o que ele gerou.
- **`.fingerprintignore` (em `app/`) tira do hash o que o `pod install` gera.**
  O EAS calcula o fingerprint do iOS depois do `pod install`, que cria
  `Podfile.lock` e `calorIA.xcworkspace` e reescreve o `project.pbxproj`; a
  máquina de dev e o GitHub Actions calculam sem ele. O primeiro build de iOS
  foi recusado pelo próprio EAS por isso ("Runtime version mismatch"). Custo:
  mudança feita **só** no `project.pbxproj` não troca o runtime version — nesse
  caso, gere build de loja antes de publicar OTA.
- **`PrivacyInfo.xcprivacy` também sai do hash.** O `pod install` do React
  Native agrega os Required Reason APIs dos pods e reescreve
  `ios/calorIA/PrivacyInfo.xcprivacy` no EAS. Era o último arquivo divergente:
  todo build de iOS depois do OTA (29/09) caiu em "Runtime version mismatch".
  Mesmo custo do `project.pbxproj`: mexer só nesse arquivo não troca o runtime.
- **`cliFile` do Gradle resolve o `@expo/cli` a partir do `expo`.** O npm deixa
  o `@expo/cli` aninhado em `node_modules/expo/node_modules`; resolvê-lo direto
  de `android/` falhava, o `cliFile` virava a pasta `android/app` e o
  `createBundleReleaseJsAndAssets` quebrava em todo build de Android no EAS.
