# OTA Android e paridade iOS — execução

Execução iniciada em 14/10/2026 (America/Sao_Paulo). Spec e plano em
`docs/superpowers/`. Branch: `fix/ota-android-paridade-ios`.

## Implementação e compatibilidade

- Canal `production` declarado no AndroidManifest.xml e no Expo.plist.
- `updates.requestHeaders` também declarado no app.json: o EAS CLI 24.14.0 roda
  `expo-updates configuration:syncnative` antes do upload e remove o cabeçalho
  nativo quando o app.json não o declara. Reprodução feita no primeiro disparo,
  cancelado antes da entrega; a configuração corrigida foi sincronizada e testada
  nas duas plataformas antes do novo build.
- Gate iOS no CI verifica UIAppFonts, existência, diretório e tabelas da fonte,
  e presença na fase Resources do projeto Xcode. Testes cobrem HTML, ausência,
  fonte truncada, referência removida, fase Resources ausente e UIAppFonts ausente.
- Nenhuma dependência ou script de package.json alterado. A mudança de nativo/config
  é o cabeçalho de canal; os mesmos módulos nativos continuam disponíveis para JS.

| Plataforma | Fingerprint atual verificado (Node 22 e 24) | Legados mantidos |
|---|---|---|
| Android | `9a9173edf9fb0664f7f177227c1728169caaeb0b` | 28 `3db37149985ade909c1330d0e4335da12676399b`, 27 `0457893087a8537c05f9545b55dd20050aed780b` |
| iOS | `0aee9a097c7650b889b243718ef0bc7b92b57300` | 19 `53c1cf8b180ac12f82360b6c4a4f272ba46bacf5`, 18 `a0e3c5c63b023d266f778b9d260cbb79fc093abd` |

Simulação com fingerprints resolvidos novamente após o build: quatro publicações,
`skipped: []`. Builds Android 26/iOS 17 seguem excluídos por não terem expo-audio.
A comparação com o fingerprint Linux do workflow OTA fica pendente do merge aprovado.

## Evidência de OTA anterior

Consulta ao vivo em 15/10/2026 às 01:26 UTC (14/10 às 22:26 local), janela de 30 dias.
Os números abaixo são dos grupos mais recentes de cada runtime, não uma soma de
cada publicação histórica. Não provam qual binário o Play está distribuindo.

| Build/runtime | Grupo consultado | Instalações | Falhas |
|---|---|---|---|
| Android 28 | `cada39ea-f5be-4674-b3c9-6fd46990e1f1` | 0 | 0 |
| Android 27 | `f3f00be8-9c08-4dd6-be06-ab1c911f3790` | 0 | 0 |
| iOS 19 | `a613dc7b-8dbc-463a-80a9-6fdfa55ea27d` | 2 | 0 |
| iOS 18 | `cc220dab-b725-4fd6-864b-073fbe31eefe` | 0 | 0 |

Reproduzir: `cd app && npx eas-cli@latest update:insights <grupo> --platform android|ios --days 30 --json`.

## Validação automatizada

- Testes novos executados antes da correção: falhas nos dois canais ausentes,
  cobertura dos runtimes atuais e gate iOS inexistente.
- Suíte completa: **82 suítes, 534 testes passando**.
- `npx tsc --noEmit`: passou.
- ESLint nos três arquivos de testes alterados: sem erros.
- `node scripts/verify-android-fonts.js` e `node scripts/verify-ios-fonts.js`: passaram.
- `plutil -lint ios/calorIA/Supporting/Expo.plist`: passou.
- Bundle Android de release: passou; Metro emite aviso preexistente sobre configuração.
- `configuration:syncnative --platform android|ios --workflow generic`: preserva os
  canais e os testes passam em seguida.

### Perfis preview e development

A [documentação Expo](https://docs.expo.dev/eas-update/channel-surfing/) descreve a
injeção do canal do eas.json durante EAS Build. Foi testado também o código real de
`@expo/build-tools@24.14.0` publicado no npm: funções
`androidSetChannelNativelyAsync` e `iosSetChannelNativelyAsync` executadas em cópias
scratch dos arquivos nativos, inicialmente com production. Ambas sobrescreveram
para preview e depois development; leitura dos arquivos confirmou os dois valores.

O último preview Android disponível no EAS é antigo (versionCode 20, setembro),
anterior a esta mudança. O harness verifica a sobrescrita atual, mas não substitui
inspeção de um novo binário preview. Esse risco deve continuar visível no PR.

## Build Android 29

- [EAS Build](https://expo.dev/accounts/mateusnogueiras-team/projects/caloria/builds/a2ff636a-a135-4a97-9590-13e1449fa85f)
- Commit de origem: `a42b3187a60eb23ca52190d34e461b2794d04b5b`.
- Perfil: production; versionCode remoto: 29.
- Fingerprint informado pelo EAS: `9a9173edf9fb0664f7f177227c1728169caaeb0b`.
- Status EAS: **FINISHED**. Manifest protobuf confirma package `br.com.caloriaoficial.app`, versionCode **29**, versão 1.0.
- `base/assets/fingerprint`: `9a9173edf9fb0664f7f177227c1728169caaeb0b`, igual ao local e ao EAS/Linux.
- Manifest empacotado contém `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` com `{"expo-channel-name":"production"}`.
- **32 bibliotecas de 64 bits** (arm64-v8a/x86_64), todos os segmentos PT_LOAD com `p_align >= 16384`.
- BundleConfig.pb contém `12 04 08 01 10 02`: uncompress native libraries + PAGE_ALIGNMENT_16K.
- Cinco fontes Inter extraídas: válidas e byte a byte idênticas à origem (`verify-android-fonts.js`).
- Arquivo entregue em `~/Desktop/caloria-v29-production.aab`.
- SHA-256: `b9e6c6c802e65e2588322b9a0b08bb57177c91b637a972ba40df932159384a33`.
- [PR #67](https://github.com/Mateus-Nogueira-GT/calorIA-Frontend/pull/67): CI remoto de app e backend passou. Merge aguarda aprovação.

A auditoria do artefato não substitui aceite do Play, smoke em Android ou instalações reais de OTA.

## Pendências de entrega

- [ ] Responsável informa o versionCode ativo em Produção, origem do AAB e rollout.
- [ ] Responsável envia o AAB verificado ao Play e registra trilha/porcentagem/data.
- [ ] Se houver erro de 16 KB, registrar texto exato e versionCode citado, interrompendo o upload.
- [ ] Usuário aprova merge; acompanhar CI e workflow OTA da main, incluindo quatro legados sem warning.
- [ ] Após publicação e duas aberturas no Android 29, confirmar instalações > 0 no grupo OTA novo.
- [ ] Validar build iOS 19 em iPhone **e** iPad pelo roteiro da Task 7 do plano:
  dashboard/calorias/Fibras, scanner/editar fibra, diário/edição/grupo da refeição,
  voz com troca de aba e bloqueio, interrupção da gravação na Central de Controle,
  chamada recebida, silencioso e scanner sem conta. Registrar modelo/OS/build,
  update ID, resultado e evidências. Instalações de OTA não comprovam esses fluxos.

Nenhum build novo de iOS faz parte desta entrega. Não registrar publicação no Play,
aceite de dispositivo ou instalações do runtime novo antes dessas evidências.
