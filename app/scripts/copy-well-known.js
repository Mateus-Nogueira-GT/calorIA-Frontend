#!/usr/bin/env node
// Copia os arquivos de verificação de domínio (Universal Links / App Links)
// para <dist>/.well-known/, de onde a Vercel os serve.
const fs = require('node:fs');
const path = require('node:path');

const sourceDir = path.resolve(__dirname, '../web/well-known');
const defaultDist = path.resolve(__dirname, '../web/dist');
const files = ['apple-app-site-association', 'assetlinks.json'];

function copyWellKnown(distDir = defaultDist) {
  const target = path.join(distDir, '.well-known');
  fs.mkdirSync(target, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(target, file));
  }
  return target;
}

if (require.main === module) {
  console.log(`Arquivos de verificação copiados para ${copyWellKnown()}`);
}

module.exports = { copyWellKnown };
