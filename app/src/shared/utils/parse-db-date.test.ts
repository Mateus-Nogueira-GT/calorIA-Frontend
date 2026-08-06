import { parseDbDate } from './parse-db-date';

describe('parseDbDate (formato Postgres → Hermes-safe)', () => {
  it('formato Postgres com milissegundos e offset +00', () => {
    const d = parseDbDate('2026-07-24 15:32:10.123+00');
    expect(d.toISOString()).toBe('2026-07-24T15:32:10.123Z');
  });

  it('sem milissegundos e offset negativo -03', () => {
    const d = parseDbDate('2026-07-24 15:32:10-03');
    expect(d.toISOString()).toBe('2026-07-24T18:32:10.000Z');
  });

  it('ISO puro passa direto', () => {
    expect(parseDbDate('2026-07-24T12:00:00.000Z').toISOString()).toBe('2026-07-24T12:00:00.000Z');
  });

  it('date-only continua válido', () => {
    expect(Number.isNaN(parseDbDate('2026-07-24').getTime())).toBe(false);
  });

  it('lixo → Date inválido (sem throw)', () => {
    expect(Number.isNaN(parseDbDate('nunca').getTime())).toBe(true);
  });

  it('offset de 4 dígitos (+0000) não é corrompido', () => {
    const d = parseDbDate('2026-07-24 15:32:10+0000');
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});
