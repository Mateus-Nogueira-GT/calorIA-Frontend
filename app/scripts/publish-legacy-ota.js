#!/usr/bin/env node
/**
 * OTA para builds de loja ANTIGOS (usuários retroativos).
 *
 * O runtimeVersion é `fingerprint`: o `eas update` do workflow só chega a builds
 * com o fingerprint atual. Usuários num build anterior (ex.: Android 27 /
 * iOS 18, cujo nativo só difere nas fontes Inter e num script do package.json)
 * ficavam sem nenhuma atualização. Este script republica o mesmo JS para cada
 * runtime listado em ota-legacy-runtimes.json.
 *
 * Trava: só publica se o fingerprint ATUAL da plataforma for o mesmo em que a
 * compatibilidade foi conferida (`verifiedAgainst`). Mudou algo nativo (lib
 * nova, permissão)? O JS novo pode chamar código que o build antigo não tem e
 * quebrar o app — então pula com aviso até alguém reconferir o arquivo.
 *
 * Uso (CI, depois do `eas update` normal): MESSAGE="..." node scripts/publish-legacy-ota.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const PLATFORMS = ['android', 'ios'];

function planLegacyPublishes(config, current) {
  const publish = [];
  const skipped = [];
  for (const platform of PLATFORMS) {
    const legacy = (config.legacy?.[platform] ?? []).filter((rt) => rt !== current[platform]);
    if (legacy.length === 0) continue;
    const verified = config.verifiedAgainst?.[platform];
    if (current[platform] !== verified) {
      skipped.push({
        platform,
        reason:
          `fingerprint atual ${current[platform]} difere do verificado ${verified}: ` +
          'o nativo mudou; reconfira a compatibilidade e atualize ota-legacy-runtimes.json',
      });
      continue;
    }
    for (const runtime of legacy) publish.push({ platform, runtime });
  }
  return { publish, skipped };
}

function resolveRuntime(platform) {
  const out = execFileSync('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.trim().split('\n').pop()).runtimeVersion;
}

function main() {
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'ota-legacy-runtimes.json'), 'utf8'));
  const current = Object.fromEntries(PLATFORMS.map((p) => [p, resolveRuntime(p)]));
  const { publish, skipped } = planLegacyPublishes(config, current);

  for (const s of skipped) console.log(`::warning::OTA legado ${s.platform} pulado — ${s.reason}`);
  if (publish.length === 0) {
    console.log('Nenhum OTA legado a publicar.');
    return;
  }

  const appJsonPath = path.join(appRoot, 'app.json');
  const original = fs.readFileSync(appJsonPath, 'utf8');
  const message = (process.env.MESSAGE || 'OTA legado').split('\n')[0].slice(0, 170);
  try {
    for (const { platform, runtime } of publish) {
      // Runtime fixo só durante a publicação; o arquivo volta ao original no finally.
      const appJson = JSON.parse(original);
      appJson.runtimeVersion = runtime;
      fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
      console.log(`Publicando OTA legado: ${platform} runtime ${runtime}`);
      execFileSync(
        'eas',
        [
          'update',
          '--channel', 'production',
          '--environment', 'production',
          '--platform', platform,
          '--message', `${message} [legado ${runtime.slice(0, 8)}]`,
          '--non-interactive',
        ],
        { cwd: appRoot, stdio: 'inherit' },
      );
    }
  } finally {
    fs.writeFileSync(appJsonPath, original);
  }
}

module.exports = { planLegacyPublishes };

if (require.main === module) main();
