#!/usr/bin/env node
/**
 * Gera o app/.env durante o build do EAS.
 *
 * O `.env` é gitignored (contém a URL da API por ambiente) e por isso NÃO é
 * enviado para os servidores do EAS. Sem ele, o babel-plugin `react-native-dotenv`
 * resolve `@env` como undefined e `resolveBaseUrl` lança na inicialização do
 * build de release — o app abre e fecha na hora.
 *
 * Roda apenas no EAS (hook `eas-build-pre-install`). Localmente não faz nada:
 * o `.env` do desenvolvedor é a fonte de verdade e nunca é sobrescrito.
 */
const fs = require('node:fs');
const path = require('node:path');

const ENV_KEYS = ['API_BASE_URL', 'API_TIMEOUT', 'APP_WEB_URL', 'GOOGLE_WEB_CLIENT_ID'];

function main() {
  if (!process.env.EAS_BUILD) {
    console.log('[eas-write-env] fora do EAS — nada a fazer.');
    return;
  }

  const target = path.join(__dirname, '..', '.env');
  if (fs.existsSync(target)) {
    console.log('[eas-write-env] .env já existe no workspace — preservado.');
    return;
  }

  const missing = [];
  const lines = [];
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    // GOOGLE_WEB_CLIENT_ID é opcional (login social ainda não instalado).
    if (value == null || value === '') {
      if (key !== 'GOOGLE_WEB_CLIENT_ID') missing.push(key);
      continue;
    }
    lines.push(`${key}=${value}`);
  }

  if (missing.length > 0) {
    // Falhar aqui é melhor do que gerar um .ipa que crasha ao abrir.
    console.error(
      `[eas-write-env] variáveis ausentes no ambiente do EAS: ${missing.join(', ')}.\n` +
        'Defina-as em Environment Variables no painel do EAS (ou via `eas env:create`).',
    );
    process.exit(1);
  }

  fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
  console.log(`[eas-write-env] .env gerado com: ${lines.map((l) => l.split('=')[0]).join(', ')}`);
}

main();
