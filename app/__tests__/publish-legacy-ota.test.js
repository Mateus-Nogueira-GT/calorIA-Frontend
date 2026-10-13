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
  it('tem o formato esperado e runtimes de 40 caracteres hex', () => {
    for (const platform of ['android', 'ios']) {
      expect(real.verifiedAgainst[platform]).toMatch(/^[0-9a-f]{40}$/);
      for (const rt of real.legacy[platform]) expect(rt).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
