#!/usr/bin/env node
// Checks both committed Android assets and, optionally, fonts extracted from an AAB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const appRoot = path.resolve(__dirname, '..');
const androidDir = path.join(appRoot, 'android/app/src/main/assets/fonts');
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : androidDir;
const fonts = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold'];
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'android/link-assets-manifest.json'), 'utf8'));

function validateFont(bytes, label) {
  if (bytes.length < 12 || bytes.readUInt32BE(0) !== 0x00010000) {
    throw new Error(`${label}: não é uma fonte TrueType válida`);
  }
  const count = bytes.readUInt16BE(4);
  const directoryEnd = 12 + count * 16;
  if (!count || directoryEnd > bytes.length) throw new Error(`${label}: diretório TTF inválido`);
  const tables = new Set();
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    const tag = bytes.toString('ascii', entry, entry + 4);
    const offset = bytes.readUInt32BE(entry + 8);
    const length = bytes.readUInt32BE(entry + 12);
    if (tables.has(tag) || offset < directoryEnd || offset + length > bytes.length) {
      throw new Error(`${label}: tabela TTF inválida (${tag})`);
    }
    tables.add(tag);
  }
  for (const tag of ['head', 'cmap', 'name', 'hhea', 'hmtx', 'maxp', 'glyf', 'loca']) {
    if (!tables.has(tag)) throw new Error(`${label}: tabela TTF ausente (${tag})`);
  }
}

try {
  for (const weight of fonts) {
    const name = `Inter-${weight}.ttf`;
    const source = fs.readFileSync(path.join(appRoot, 'assets/fonts', name));
    const target = fs.readFileSync(path.join(targetDir, name));
    validateFont(source, `origem/${name}`);
    validateFont(target, `Android/${name}`);
    if (!source.equals(target)) throw new Error(`${name}: fonte Android diverge da origem`);
    if (targetDir === androidDir) {
      const entry = manifest.data.find((asset) => asset.path === `assets/fonts/${name}`);
      const sha1 = crypto.createHash('sha1').update(source).digest('hex');
      if (entry?.sha1 !== sha1) throw new Error(`${name}: manifest de assets desatualizado`);
    }
  }
  console.log('OK: cinco fontes Inter válidas e sincronizadas com a origem.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
