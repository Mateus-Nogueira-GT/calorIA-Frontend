const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { copyWellKnown } = require('./copy-well-known');

describe('copy-well-known', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'well-known-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const read = (name) => fs.readFileSync(path.join(tmp, '.well-known', name), 'utf8');

  it('copia os dois arquivos para .well-known/', () => {
    copyWellKnown(tmp);
    expect(fs.existsSync(path.join(tmp, '.well-known', 'apple-app-site-association'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.well-known', 'assetlinks.json'))).toBe(true);
  });

  it('AASA é JSON válido com o appID do app', () => {
    copyWellKnown(tmp);
    const aasa = JSON.parse(read('apple-app-site-association'));
    expect(aasa.applinks.details[0].appIDs).toEqual(['Z7U2XD3LS9.br.com.caloriaoficial.app']);
    expect(aasa.applinks.details[0].components.map((c) => c['/'])).toEqual(['/convite', '/convite/']);
  });

  it('assetlinks.json tem ao menos uma impressão SHA-256 válida', () => {
    copyWellKnown(tmp);
    const [entry] = JSON.parse(read('assetlinks.json'));
    expect(entry.relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(entry.target.package_name).toBe('br.com.caloriaoficial.app');
    const prints = entry.target.sha256_cert_fingerprints;
    expect(prints.length).toBeGreaterThanOrEqual(1);
    prints.forEach((p) => expect(p).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/));
  });
});
