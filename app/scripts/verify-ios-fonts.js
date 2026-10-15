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
  if (![0x00010000, 0x4f54544f, 0x74727565].includes(tag)) return false;
  const count = bytes.readUInt16BE(4);
  const directoryEnd = 12 + count * 16;
  if (!count || directoryEnd > bytes.length) return false;
  const tables = new Set();
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    const table = bytes.toString('ascii', entry, entry + 4);
    const offset = bytes.readUInt32BE(entry + 8);
    const length = bytes.readUInt32BE(entry + 12);
    if (tables.has(table) || offset < directoryEnd || offset + length > bytes.length) return false;
    tables.add(table);
  }
  const required = ['head', 'cmap', 'name', 'hhea', 'hmtx', 'maxp'];
  required.push(...(tag === 0x4f54544f ? ['CFF '] : ['glyf', 'loca']));
  return required.every((table) => tables.has(table));
}

function verifyIosFonts({ infoPlist, pbxproj, readFont }) {
  const fonts = uiAppFonts(infoPlist);
  if (!fonts || fonts.length === 0) return ['Info.plist: UIAppFonts ausente ou vazio'];
  const errors = [];
  const resources = pbxproj.match(/\/\* Begin PBXResourcesBuildPhase section \*\/([\s\S]*?)\/\* End PBXResourcesBuildPhase section \*\//)?.[1] || '';
  for (const name of fonts) {
    const bytes = readFont(name);
    if (!bytes) errors.push(`${name}: não existe em app/assets/fonts`);
    else if (!isTrueType(bytes)) errors.push(`${name}: não é uma fonte TrueType/OpenType válida`);
    else if (!resources.includes(`/* ${name} in Resources */`)) {
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
