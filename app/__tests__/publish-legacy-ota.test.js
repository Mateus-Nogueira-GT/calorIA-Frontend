import { describe, it, expect } from '@jest/globals';
import { planLegacyPublishes } from '../scripts/publish-legacy-ota';
import real from '../ota-legacy-runtimes.json';

const config = {
  verifiedAgainst: { android: 'A-NOVO', ios: 'I-NOVO' },
  legacy: { android: ['A-27'], ios: ['I-18'] },
};

describe('planLegacyPublishes', () => {
  it('nativo igual ao verificado: publica para cada runtime legado', () => {
    const plan = planLegacyPublishes(config, { android: 'A-NOVO', ios: 'I-NOVO' });
    expect(plan.publish).toEqual([
      { platform: 'android', runtime: 'A-27' },
      { platform: 'ios', runtime: 'I-18' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('nativo mudou numa plataforma: pula só ela, com o motivo', () => {
    const plan = planLegacyPublishes(config, { android: 'A-OUTRO', ios: 'I-NOVO' });
    expect(plan.publish).toEqual([{ platform: 'ios', runtime: 'I-18' }]);
    expect(plan.skipped).toEqual([
      { platform: 'android', reason: expect.stringContaining('A-OUTRO') },
    ]);
  });

  it('plataforma sem runtimes legados não publica nada', () => {
    const plan = planLegacyPublishes(
      { verifiedAgainst: { android: 'A-NOVO' }, legacy: { android: [] } },
      { android: 'A-NOVO', ios: 'I-NOVO' },
    );
    expect(plan.publish).toEqual([]);
  });

  it('nunca republica para o próprio runtime atual', () => {
    const plan = planLegacyPublishes(
      { verifiedAgainst: { android: 'A-NOVO' }, legacy: { android: ['A-NOVO', 'A-27'] } },
      { android: 'A-NOVO' },
    );
    expect(plan.publish).toEqual([{ platform: 'android', runtime: 'A-27' }]);
  });
});

describe('ota-legacy-runtimes.json', () => {
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

  it('tem o formato esperado e runtimes de 40 caracteres hex', () => {
    for (const platform of ['android', 'ios']) {
      expect(real.verifiedAgainst[platform]).toMatch(/^[0-9a-f]{40}$/);
      for (const rt of real.legacy[platform]) expect(rt).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
