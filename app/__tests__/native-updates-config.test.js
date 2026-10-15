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

  it('config Expo preserva o canal na sincronização do EAS', () => {
    expect(JSON.parse(read('app.json')).updates.requestHeaders).toEqual({ 'expo-channel-name': 'production' });
  });

  it('runtime continua vindo do fingerprint nas duas plataformas', () => {
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('file:fingerprint');
    expect(read('ios/calorIA/Supporting/Expo.plist')).toContain('<string>file:fingerprint</string>');
  });
});
