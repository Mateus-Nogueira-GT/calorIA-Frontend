# OTA que não chega ao Android e paridade das correções no iOS

Data: 2026-10-14 · Branch: `fix/ota-android-paridade-ios`

## Contexto

- A Apple aprovou o app (versão 1.0, build 19).
- Usuários Android, "independentemente do build", continuam vendo os problemas já
  corrigidos: botão de editar, rótulos de uma letra, fibra, texto cortado e áudio do
  coach.
- Pedido: confirmar se as correções estão na `main` e aplicar no iOS os mesmos ajustes
  feitos no Android.

## Diagnóstico (medido, não suposto)

### As correções estão na `main`

Conferido em `origin/main` (`9a0176b`): `autoLineHeight` no `Text`; rótulos e
`Fibra (g)` no `ScanItemRow`; `sendRef` no `useVoiceMessage`; botão `edit-` no
`FoodLogItem`; card `Fibras` no Dashboard; `PATCH /food-log/:id` na API; scanner sem
conta na Welcome. Os OTAs foram publicados para os quatro runtimes (Android 28/27,
iOS 19/18).

### O Android nunca baixou um OTA

`eas update:insights` (30 dias), por runtime:

| Runtime | Build | Instalações de OTA |
|---|---|---|
| `53c1cf8…` iOS | 19 (aprovado) | **2**, 0 falhas |
| `3db3714…` Android | 28 | **0** |
| `0457893…` Android | 27 | **0** |
| `6e863d4…` Android | 26 | **0** |
| `2ce1e8a…`, `544816c…` Android | anteriores | **0** |

Nenhum aparelho Android instalou **nenhum** OTA em 30 dias, em **nenhum** runtime.
Logo, os aparelhos rodam um binário cujo runtime e canal não casam com nada publicado.

O que se sabe dos binários Android:

- O AAB 28 (EAS) está correto para OTA: `assets/fingerprint` = `3db3714…`, cabeçalho
  `{"expo-channel-name":"production"}` no manifest, URL certa. Mas foi o que travou no
  Play com o erro de 16 KB. A análise (2026-10-12) não achou problema de 16 KB nele;
  o envio não foi concluído/confirmado.
- O repositório **não** fixa o canal: `AndroidManifest.xml` e `Expo.plist` não têm o
  cabeçalho `expo-channel-name`. Só o EAS Build o injeta. Um AAB gerado localmente com
  `./gradlew bundleRelease` (procedimento descrito em `docs/mobile-hardening.md` §6, e
  usado para versões anteriores; versionCode 23 lá registrado) pede updates **sem
  canal** e nunca recebe OTA.
- Builds ≤ 27 empacotam fontes Inter **HTML** em `android/app/src/main/assets/fonts`
  (correção nativa #62, só a partir do 28). OTA não corrige isso.

Hipótese principal: **o Play distribui um AAB anterior ao 28, gerado fora do EAS (sem
canal) ou com runtime sem OTA**. A confirmação é o versionCode ativo no Play Console
(Task 4).

### iOS: o que o Android recebeu e o iOS já tem

| Correção no Android | Natureza | iOS hoje |
|---|---|---|
| #62 fontes Inter HTML → TTF (`android/.../assets/fonts`) | nativa | iOS lê `app/assets/fonts`, corrigido no #59 (06/10). Builds ≥ 18 já têm TTF válido; o 19 aprovado está ok. **Sem gate no CI para o iOS.** |
| #61 ciclo de vida/sessão da voz | JS | Chega por OTA ao 19 (2 instalações). Validado só em Android real. |
| #63–#65 (scanner sem conta, edição, rótulos, fibra, tablet, voz) | JS + API | Chega por OTA ao 19. Sem validação manual em iPhone/iPad. |
| 16 KB de página | nativa, só Android | Não se aplica. |
| OTA para builds antigos (#66) | CI | Já cobre iOS 18. |
| Canal `production` | config nativa | Igual ao Android: só o EAS injeta. |

O iOS **já recebe** as mesmas correções. O que falta é: (1) fixar o canal no nativo,
(2) um gate de fontes no CI para o iOS e (3) validar em aparelho iOS (iPhone e iPad).

## Requisitos

### R1 — Canal fixo no nativo (Android e iOS)

`AndroidManifest.xml` ganha
`expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` =
`{"expo-channel-name":"production"}`; `Expo.plist` ganha `EXUpdatesRequestHeaders` com
`expo-channel-name = production`. Qualquer binário de produção, EAS ou local, pede o
canal certo. (Builds `preview`/`development` do EAS continuam sobrescrevendo o canal
pelo perfil.)

### R2 — OTA continua chegando aos builds atuais

R1 muda o fingerprint das duas plataformas. No mesmo PR, `ota-legacy-runtimes.json`
passa a ter `verifiedAgainst` = fingerprints novos e acrescenta em `legacy` os runtimes
do Android 28 (`3db3714…`) e do iOS 19 (`53c1cf8…`). O nativo entre eles e o novo só
difere no cabeçalho de canal: o JS é compatível.

### R3 — Build Android 29 pelo EAS, verificado antes do Play

Antes de enviar: fingerprint embutido = fingerprint novo do Android; cabeçalho de canal
`production`; bibliotecas de 64 bits com `p_align ≥ 16384` e `BundleConfig` com
alinhamento 16 KB; fontes Inter válidas (`verify-android-fonts.js` nas fontes extraídas).

### R4 — Publicação no Play com o diagnóstico registrado

Antes de subir o 29: registrar qual versionCode está ativo em produção (e de onde veio).
Se o Play acusar 16 KB de novo, registrar o texto exato e o versionCode citado.

### R5 — Gate de fontes no CI para o iOS

`scripts/verify-ios-fonts.js`: toda fonte em `UIAppFonts` do `Info.plist` existe em
`app/assets/fonts`, é TrueType válido e está referenciada no `project.pbxproj`. Roda no
CI. **Sem** script novo no `package.json` (ele entra no fingerprint).

### R6 — Validação em aparelho iOS

Roteiro manual no build 19 (App Store/TestFlight) depois do OTA, em iPhone **e iPad**,
cobrindo os cinco feedbacks e o ciclo de vida da voz (background, Central de Controle,
chamada recebida, troca de aba).

## Fora de escopo

- Build iOS novo: o 19 recebe OTA (R2 o mantém em `legacy`). Um build 20 só quando
  houver outra mudança nativa no iOS.
- Usuários Android em builds sem OTA: só saem pelo Play (R3/R4).

## Critérios de aceite

| Caso | Esperado |
|---|---|
| `AndroidManifest.xml` e `Expo.plist` | contêm o canal `production` (teste no CI) |
| Merge na `main` | OTA publicado para o fingerprint novo **e** para Android 28/27 e iOS 19/18 |
| AAB 29 | fingerprint, canal, 16 KB e fontes conferidos antes do upload |
| Aparelho Android com o 29 | `update:insights` do runtime novo passa a ter instalações |
| Fonte do iOS trocada por HTML | CI falha no gate |
| iPhone e iPad com o 19 | os cinco feedbacks resolvidos, voz responde após background |
