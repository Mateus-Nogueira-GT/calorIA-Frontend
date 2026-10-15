# OTA no Android e paridade iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o OTA chegar aos aparelhos Android (canal fixo no nativo + build 29 verificado no Play) e fechar a paridade do iOS (mesmo canal fixo, gate de fontes no CI e validação em iPhone/iPad).

**Architecture:** Uma branch com três mudanças de repositório: canal `production` fixo no `AndroidManifest.xml` e no `Expo.plist` (com teste), atualização de `ota-legacy-runtimes.json` para os novos fingerprints, e um gate `verify-ios-fonts.js` no CI. Depois, operações fora do repositório: build Android 29 no EAS, verificação do AAB, publicação no Play pelo usuário e validação manual no iOS.

**Tech Stack:** React Native 0.77 + Expo (expo-updates, `runtimeVersion: fingerprint`, `file:fingerprint` no nativo), EAS Build/Update, GitHub Actions, Jest, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-14-ota-android-e-paridade-ios.md`

## Global Constraints

- **Nada de script novo no `package.json`**: os scripts entram no fingerprint. CI e testes chamam `node scripts/...` direto.
- Canal fixo: `{"expo-channel-name":"production"}` (Android) / `EXUpdatesRequestHeaders` → `expo-channel-name = production` (iOS).
- Runtimes atuais antes desta branch: Android `3db37149985ade909c1330d0e4335da12676399b` (build 28), iOS `53c1cf8b180ac12f82360b6c4a4f272ba46bacf5` (build 19). Legados já listados: Android `0457893087a8537c05f9545b55dd20050aed780b` (27), iOS `a0e3c5c63b023d266f778b9d260cbb79fc093abd` (18).
- Builds 26 (Android) e 17 (iOS) **não** entram em `legacy`: não têm `expo-audio`.
- Fingerprint atual: `cd app && npx expo-updates runtimeversion:resolve --platform android|ios` (última linha da saída é JSON com `runtimeVersion`).
- Comandos: `cd app && npx jest <arquivo>`; `npx tsc --noEmit`; `npx eslint <arquivos>`.
- Publicar no Play, aprovar build e testar em aparelho são ações **do usuário**; o agente prepara, verifica e registra.

## Review Focus

1. **Build `preview`/`development` com o canal fixo** — o EAS precisa continuar sobrescrevendo o canal pelo perfil; um build `preview` não pode passar a puxar OTA de `production`. Verificação na Task 3 (inspecionar o manifest de um build `preview`, se existir) e registrada como risco no PR.
2. **Fingerprint calculado no CI (Linux) diferente do local (macOS)** — se divergirem, o passo de OTA legado pula com aviso. Task 2 compara com o fingerprint do AAB 29 (Task 3) antes do merge.
3. **Merge antes do AAB 29 estar no Play** — o OTA do merge vai para o fingerprint novo, que nenhum aparelho tem ainda; Android 28/27 e iOS 19/18 continuam cobertos por `legacy`. Teste do plano na Task 2.
4. **Fonte iOS presente no `Info.plist` mas fora do `project.pbxproj`** — o app compila e a fonte não carrega. Coberto pelo teste da Task 5.
5. **Play aceita o AAB 29 mas mantém o antigo em produção** (rollout parcial / outra trilha) — Task 4 registra trilha e porcentagem; `update:insights` do runtime novo é a prova final.

---

Criar a branch:

```bash
git checkout main && git pull --ff-only && git checkout -b fix/ota-android-paridade-ios
```

### Task 1: Canal `production` fixo no nativo

**Files:**
- Modify: `app/android/app/src/main/AndroidManifest.xml` (depois da linha `EXPO_RUNTIME_VERSION`, ~23)
- Modify: `app/ios/calorIA/Supporting/Expo.plist`
- Test: `app/__tests__/native-updates-config.test.js` (novo)

**Interfaces:**
- Produces: config nativa com o canal; fingerprints novos das duas plataformas (usados na Task 2).

- [x] **Step 1: Write the failing test** — `app/__tests__/native-updates-config.test.js`:

```js
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/**
 * 2026-10-14: nenhum aparelho Android instalou OTA em 30 dias. O canal só era
 * injetado pelo EAS Build; um binário gerado fora dele pedia update sem canal
 * e nunca recebia nada. O canal de produção fica fixo no nativo.
 */
describe('expo-updates: canal fixo no nativo', () => {
  it('Android pede o canal production', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain(
      'android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" ' +
        'android:value="{&quot;expo-channel-name&quot;:&quot;production&quot;}"',
    );
  });

  it('iOS pede o canal production', () => {
    const plist = read('ios/calorIA/Supporting/Expo.plist');
    expect(plist).toMatch(
      /<key>EXUpdatesRequestHeaders<\/key>\s*<dict>\s*<key>expo-channel-name<\/key>\s*<string>production<\/string>\s*<\/dict>/,
    );
  });

  it('runtime continua vindo do fingerprint nas duas plataformas', () => {
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('file:fingerprint');
    expect(read('ios/calorIA/Supporting/Expo.plist')).toContain('<string>file:fingerprint</string>');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest __tests__/native-updates-config.test.js`
Expected: FAIL nos dois primeiros testes; o terceiro passa.

- [x] **Step 3: Write minimal implementation**

`AndroidManifest.xml`, logo depois da linha `EXPO_RUNTIME_VERSION`:

```xml
    <meta-data android:name="expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY" android:value="{&quot;expo-channel-name&quot;:&quot;production&quot;}"/>
```

`Expo.plist`, depois do par `EXUpdatesRuntimeVersion`:

```xml
    <key>EXUpdatesRequestHeaders</key>
    <dict>
      <key>expo-channel-name</key>
      <string>production</string>
    </dict>
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd app && npx jest __tests__/native-updates-config.test.js && plutil -lint ios/calorIA/Supporting/Expo.plist`
Expected: PASS; `OK` do `plutil`.

- [x] **Step 5: Anotar os fingerprints novos**

Run:
```bash
cd app && for p in android ios; do printf "%s " $p; npx expo-updates runtimeversion:resolve --platform $p | tail -1 | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).runtimeVersion))"; done
```
Expected: dois hashes **diferentes** de `3db3714…` e `53c1cf8…` (o nativo mudou). Anotar para a Task 2.

- [x] **Step 6: Commit**

```bash
git add app/android/app/src/main/AndroidManifest.xml app/ios/calorIA/Supporting/Expo.plist app/__tests__/native-updates-config.test.js
git commit -m "fix(ota): canal production fixo no nativo (Android e iOS)"
```

### Task 2: OTA continua chegando aos builds atuais (runtimes legados)

**Files:**
- Modify: `app/ota-legacy-runtimes.json`
- Modify: `app/__tests__/publish-legacy-ota.test.js`

**Interfaces:**
- Consumes: fingerprints novos da Task 1 (`<ANDROID_NOVO>`, `<IOS_NOVO>`).
- Produces: config que o passo de OTA legado (`scripts/publish-legacy-ota.js`, já existente) usa no merge.

- [x] **Step 1: Write the failing test** — acrescentar em `publish-legacy-ota.test.js`, no `describe('ota-legacy-runtimes.json', …)`:

```js
  it('cobre os builds de loja atuais e antigos com OTA (Android 28/27, iOS 19/18)', () => {
    expect(real.legacy.android).toEqual(
      expect.arrayContaining([
        '3db37149985ade909c1330d0e4335da12676399b',
        '0457893087a8537c05f9545b55dd20050aed780b',
      ]),
    );
    expect(real.legacy.ios).toEqual(
      expect.arrayContaining([
        '53c1cf8b180ac12f82360b6c4a4f272ba46bacf5',
        'a0e3c5c63b023d266f778b9d260cbb79fc093abd',
      ]),
    );
  });

  it('verifiedAgainst não é nenhum runtime legado (é o nativo atual)', () => {
    for (const p of ['android', 'ios']) {
      expect(real.legacy[p]).not.toContain(real.verifiedAgainst[p]);
    }
  });

  it('merge antes do build novo estar na loja: legados continuam no plano', () => {
    const plan = planLegacyPublishes(real, real.verifiedAgainst);
    expect(plan.publish.map((x) => x.runtime)).toEqual(
      expect.arrayContaining(['3db37149985ade909c1330d0e4335da12676399b', '53c1cf8b180ac12f82360b6c4a4f272ba46bacf5']),
    );
    expect(plan.skipped).toEqual([]);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest __tests__/publish-legacy-ota.test.js`
Expected: FAIL — `3db3714…`/`53c1cf8…` ainda não estão em `legacy` e ainda são o `verifiedAgainst`.

- [x] **Step 3: Write minimal implementation** — `ota-legacy-runtimes.json` (usar os hashes anotados na Task 1, Step 5):

```json
{
  "_doc": "Builds de loja antigos que ainda recebem OTA. Ver scripts/publish-legacy-ota.js. 'verifiedAgainst' é o fingerprint atual em que a compatibilidade foi conferida; se o nativo mudar, o OTA legado é pulado até alguém reconferir e atualizar este arquivo.",
  "verifiedAgainst": {
    "android": "<ANDROID_NOVO>",
    "ios": "<IOS_NOVO>"
  },
  "legacy": {
    "android": [
      "3db37149985ade909c1330d0e4335da12676399b",
      "0457893087a8537c05f9545b55dd20050aed780b"
    ],
    "ios": [
      "53c1cf8b180ac12f82360b6c4a4f272ba46bacf5",
      "a0e3c5c63b023d266f778b9d260cbb79fc093abd"
    ]
  }
}
```

(Compatibilidade: entre 28/19 e o nativo novo só muda o cabeçalho de canal; entre 27/18 e 28/19 já foi conferido em 2026-10-13.)

- [x] **Step 4: Run tests to verify they pass + simulação real**

Run:
```bash
cd app && npx jest __tests__/publish-legacy-ota.test.js && node -e "
const { execFileSync } = require('child_process');
const { planLegacyPublishes } = require('./scripts/publish-legacy-ota');
const r = p => JSON.parse(execFileSync('npx',['expo-updates','runtimeversion:resolve','--platform',p],{encoding:'utf8',maxBuffer:64*1024*1024}).trim().split('\n').pop()).runtimeVersion;
console.log(JSON.stringify(planLegacyPublishes(require('./ota-legacy-runtimes.json'), { android: r('android'), ios: r('ios') })));"
```
Expected: PASS; `publish` com 4 entradas (Android 28 e 27, iOS 19 e 18) e `skipped: []`.

- [x] **Step 5: Commit**

```bash
git add app/ota-legacy-runtimes.json app/__tests__/publish-legacy-ota.test.js
git commit -m "ci(ota): Android 28 e iOS 19 passam a runtimes legados"
```

### Task 3: Build Android 29 no EAS e verificação do AAB

**Files:** nenhum no repositório (artefato verificado em scratchpad).

**Interfaces:**
- Consumes: branch com Tasks 1–2 (o build sai do commit local; o EAS envia o projeto).
- Produces: AAB 29 verificado em `~/Desktop/caloria-v29-production.aab`.

- [x] **Step 1: Disparar o build**

Run: `cd app && npx eas-cli@latest build --platform android --profile production --non-interactive --no-wait`
Expected: link do build; anotar o ID. Acompanhar com `npx eas-cli@latest build:view <ID> --json` até `FINISHED`.

- [x] **Step 2: Baixar e extrair**

```bash
SP=<scratchpad>/aab29 && mkdir -p $SP && cd $SP
curl -sL -o app.aab "$(cd <repo>/app && npx eas-cli@latest build:view <ID> --json | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).artifacts.buildUrl))")"
unzip -q -o app.aab 'base/assets/*' 'base/lib/*' 'base/manifest/*' BundleConfig.pb
```

- [x] **Step 3: Conferir fingerprint e canal**

Run: `cat base/assets/fingerprint; strings -n 6 base/manifest/AndroidManifest.xml | grep -A1 REQUEST_HEADERS`
Expected: o `<ANDROID_NOVO>` da Task 1; `{"expo-channel-name":"production"}`. Se o fingerprint divergir, **parar**: atualizar `verifiedAgainst.android` para o valor do AAB (é o que os aparelhos terão) e reexecutar a Task 2, Step 4.

- [x] **Step 4: Conferir 16 KB**

```bash
python3 - <<'EOF'
import struct, glob
bad = []
for f in glob.glob('base/lib/*/*.so'):
    if f.split('/')[2] not in ('arm64-v8a', 'x86_64'): continue
    d = open(f, 'rb').read()
    phoff = struct.unpack_from('<Q', d, 0x20)[0]; es, n = struct.unpack_from('<HH', d, 0x36)
    al = [struct.unpack_from('<Q', d, phoff+i*es+48)[0] for i in range(n) if struct.unpack_from('<I', d, phoff+i*es)[0] == 1]
    if min(al) < 16384: bad.append((f, hex(min(al))))
print('libs fora de 16 KB:', bad or 'nenhuma')
EOF
xxd BundleConfig.pb | head -2   # procurar "1204 0801 1002": uncompress_native_libraries enabled + PAGE_ALIGNMENT_16K
```
Expected: `nenhuma`; os bytes `12 04 08 01 10 02` presentes.

- [x] **Step 5: Conferir fontes**

Run: `cd <repo>/app && node scripts/verify-android-fonts.js <scratchpad>/aab29/base/assets/fonts`
Expected: sucesso (5 TTF válidos e idênticos à origem).

- [x] **Step 6: Entregar o AAB**

Run: `cp <scratchpad>/aab29/app.aab ~/Desktop/caloria-v29-production.aab && shasum -a 256 ~/Desktop/caloria-v29-production.aab`
Registrar ID do build, versionCode, fingerprint e SHA-256 no PR.

### Task 4: Publicação no Play (usuário) com o diagnóstico registrado

**Files:** Modify `docs/mobile-hardening.md` §6 (registro).

- [ ] **Step 1: Usuário informa, antes de subir:** versionCode ativo em **Produção** no Play Console, trilha/rollout, e se aquele AAB veio do EAS ou de `gradlew bundleRelease` local.
- [ ] **Step 2: Usuário envia o `caloria-v29-production.aab`** para Produção (rollout 100% ou o escolhido). Se o Console acusar 16 KB, registrar o texto exato e **o versionCode citado no erro** e parar aqui.
- [ ] **Step 3: Registrar em `docs/mobile-hardening.md` §6**, no lugar de "(atual: 23)": versionCode atual, data, origem (EAS, ID do build) e a regra "AAB de produção sai só do EAS (o canal de OTA e a assinatura dependem disso)".
- [ ] **Step 4: Commit**

```bash
git add docs/mobile-hardening.md
git commit -m "docs(android): registra versionCode no Play e regra de AAB só pelo EAS"
```

### Task 5: Gate de fontes do iOS no CI

**Files:**
- Create: `app/scripts/verify-ios-fonts.js`
- Test: `app/__tests__/verify-ios-fonts.test.js`
- Modify: `.github/workflows/ci.yml` (passo ao lado de "fontes Android válidas e sincronizadas")

**Interfaces:**
- Produces: `verifyIosFonts({ infoPlist: string, pbxproj: string, readFont: (name) => Buffer | null }): string[]` (lista de erros; vazia = ok).

- [x] **Step 1: Write the failing test** — `app/__tests__/verify-ios-fonts.test.js`:

```js
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { verifyIosFonts } from '../scripts/verify-ios-fonts';

const root = path.resolve(__dirname, '..');
const realInput = () => ({
  infoPlist: fs.readFileSync(path.join(root, 'ios/calorIA/Info.plist'), 'utf8'),
  pbxproj: fs.readFileSync(path.join(root, 'ios/calorIA.xcodeproj/project.pbxproj'), 'utf8'),
  readFont: (name) => {
    const p = path.join(root, 'assets/fonts', name);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  },
});

describe('verifyIosFonts', () => {
  it('o repositório atual passa', () => {
    expect(verifyIosFonts(realInput())).toEqual([]);
  });

  it('fonte HTML (o erro de antes do #59) falha', () => {
    const input = realInput();
    const errors = verifyIosFonts({
      ...input,
      readFont: (n) => (n === 'Inter-Bold.ttf' ? Buffer.from('\n<!DOCTYPE html>') : input.readFont(n)),
    });
    expect(errors).toEqual([expect.stringContaining('Inter-Bold.ttf')]);
  });

  it('fonte do Info.plist ausente em assets/fonts falha', () => {
    const input = realInput();
    const errors = verifyIosFonts({ ...input, readFont: (n) => (n === 'Inter-Medium.ttf' ? null : input.readFont(n)) });
    expect(errors).toEqual([expect.stringContaining('Inter-Medium.ttf')]);
  });

  it('fonte fora do project.pbxproj falha (compila, mas não carrega)', () => {
    const input = realInput();
    const errors = verifyIosFonts({ ...input, pbxproj: input.pbxproj.replaceAll('Inter-SemiBold.ttf', 'X.ttf') });
    expect(errors).toEqual([expect.stringContaining('Inter-SemiBold.ttf')]);
  });

  it('Info.plist sem UIAppFonts falha', () => {
    const input = realInput();
    expect(verifyIosFonts({ ...input, infoPlist: '<plist><dict></dict></plist>' })).toEqual([
      expect.stringContaining('UIAppFonts'),
    ]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx jest __tests__/verify-ios-fonts.test.js`
Expected: FAIL — `Cannot find module '../scripts/verify-ios-fonts'`.

- [x] **Step 3: Write minimal implementation** — `app/scripts/verify-ios-fonts.js`:

```js
#!/usr/bin/env node
/**
 * Gate das fontes do iOS (paridade com verify-android-fonts.js).
 * O iOS empacota app/assets/fonts, que até o #59 eram páginas HTML com nome
 * .ttf: o app compilava e caía na fonte do sistema. Confere, para cada fonte
 * do UIAppFonts: existe, é TrueType válido e está no project.pbxproj.
 * Uso: node scripts/verify-ios-fonts.js (sem script no package.json: entra no fingerprint).
 */
const fs = require('node:fs');
const path = require('node:path');

function uiAppFonts(infoPlist) {
  const m = infoPlist.match(/<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!m) return null;
  return [...m[1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1].trim());
}

function isTrueType(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const tag = bytes.readUInt32BE(0);
  // 0x00010000 = TrueType; 'OTTO' = OpenType/CFF; 'true' = TrueType (Apple).
  return tag === 0x00010000 || tag === 0x4f54544f || tag === 0x74727565;
}

function verifyIosFonts({ infoPlist, pbxproj, readFont }) {
  const fonts = uiAppFonts(infoPlist);
  if (!fonts || fonts.length === 0) return ['Info.plist: UIAppFonts ausente ou vazio'];
  const errors = [];
  for (const name of fonts) {
    const bytes = readFont(name);
    if (!bytes) errors.push(`${name}: não existe em app/assets/fonts`);
    else if (!isTrueType(bytes)) errors.push(`${name}: não é uma fonte TrueType/OpenType válida`);
    else if (!pbxproj.includes(`/* ${name} in Resources */`)) {
      errors.push(`${name}: não está nos Resources do project.pbxproj`);
    }
  }
  return errors;
}

module.exports = { verifyIosFonts };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const errors = verifyIosFonts({
    infoPlist: fs.readFileSync(path.join(root, 'ios/calorIA/Info.plist'), 'utf8'),
    pbxproj: fs.readFileSync(path.join(root, 'ios/calorIA.xcodeproj/project.pbxproj'), 'utf8'),
    readFont: (name) => {
      const p = path.join(root, 'assets/fonts', name);
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    },
  });
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log('Fontes iOS válidas.');
}
```

`ci.yml`, logo depois do passo "fontes Android válidas e sincronizadas":

```yaml
      - name: fontes iOS válidas e no projeto Xcode
        run: node scripts/verify-ios-fonts.js
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest __tests__/verify-ios-fonts.test.js && node scripts/verify-ios-fonts.js && npx eslint __tests__/verify-ios-fonts.test.js __tests__/native-updates-config.test.js`
Expected: PASS; "Fontes iOS válidas."; lint sem erros.

- [x] **Step 5: Confirmar que o fingerprint não mudou com a Task 5**

Run: o comando da Task 1, Step 5.
Expected: os mesmos `<ANDROID_NOVO>`/`<IOS_NOVO>` (scripts/ e __tests__/ não entram no fingerprint).

- [x] **Step 6: Commit**

```bash
git add app/scripts/verify-ios-fonts.js app/__tests__/verify-ios-fonts.test.js .github/workflows/ci.yml
git commit -m "ci(ios): gate de fontes do iOS (paridade com o Android)"
```

### Task 6: PR, merge e prova de entrega do OTA

- [x] **Step 1:** `cd app && npx jest && npx tsc --noEmit` — tudo verde. Push e PR com: diagnóstico (tabela de `update:insights`), fingerprints novos, ID/SHA do AAB 29, risco do Review Focus 1.
- [ ] **Step 2:** Merge (com aprovação do usuário). Acompanhar `ota-update.yml` até `success` e conferir no log do passo legado: 4 publicações (`[legado 3db37149]`, `[legado 04578930]`, `[legado 53c1cf8b]`, `[legado a0e3c5c6]`), nenhum `::warning::`.
- [ ] **Step 3:** Depois que o AAB 29 estiver no Play e alguém abrir o app duas vezes: `npx eas-cli@latest update:insights <grupo do runtime Android novo> --platform android --days 2 --json` → `installs > 0`. Registrar no PR.

### Task 7: Validação manual no iOS (usuário, roteiro do agente)

Build 19 (App Store), depois de abrir o app **duas vezes** (o OTA aplica na segunda abertura). Fazer em **iPhone e iPad**:

- [ ] Tela inicial: total de calorias inteiro (sem corte) e card **Fibras** (2×2 no iPhone, 4 lado a lado no iPad).
- [ ] Scanner: rótulos por extenso; resultado em leitura com **Editar** → editar Fibra → **Concluir** → salvar no diário.
- [ ] Diário: linha com "Fibras Xg"; **Editar** abre preenchido; salvar atualiza o total sem recarregar; refeição vinda do scanner continua no mesmo grupo (Almoço/Jantar).
- [ ] Coach por voz: gravar → soltar → **trocar de aba** antes da resposta → voltar: pergunta e resposta presentes.
- [ ] Coach por voz: gravar → **bloquear a tela** antes da resposta → desbloquear: pergunta e resposta presentes.
- [ ] Coach por voz: durante a **gravação**, abrir a Central de Controle → gravação descartada, sem envio, microfone liberado (indicador laranja some).
- [ ] Coach por voz com o aparelho no **silencioso**: grava e transcreve normalmente.
- [ ] Sem conta: Welcome → "Escanear um prato sem conta" → resultado → "Criar conta para salvar".
- [ ] Registrar o resultado (ok/falha + print) no PR ou numa issue.

## Registro de execução

Tasks 1, 2, 3 e 5 concluídas e validadas; Task 6 Step 1 concluído no PR #67. Task 4 aguarda dados/publicação do usuário, Task 6 Step 2 aprovação do merge, e Task 7 testes em aparelhos. O EAS remove o cabeçalho nativo ao sincronizar quando `updates.requestHeaders` não está em `app.json`; foi necessário declarar o canal também ali e recalcular ambos os fingerprints. Evidências, artefato e pendências: [relatório de execução](../../ota-android-paridade-ios-2026-10-14.md).
