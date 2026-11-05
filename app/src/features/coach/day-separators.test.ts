import { daySeparators } from './day-separators';

const now = new Date(2026, 10, 5, 14, 0);
const at = (d: number, h = 10) => ({ timestamp: new Date(2026, 10, d, h, 0) });

it('separa por dia: data, ontem, hoje', () => {
  expect(daySeparators([at(2), at(2, 11), at(4), at(5), at(5, 13)], now)).toEqual([
    '02/11',
    null,
    'Ontem',
    'Hoje',
    null,
  ]);
});

it('mensagens sem horário ganham um só "Conversas anteriores"', () => {
  expect(daySeparators([{ timestamp: null }, { timestamp: null }, at(5)], now)).toEqual([
    'Conversas anteriores',
    null,
    'Hoje',
  ]);
});
