import { formatDelta, spokenDelta } from './format';

it.each([
  [12, 10, '+20%'],
  [9, 10, '−10%'],
  [10, 10, 'igual'],
  [5, 0, '—'],
  [0, 0, 'igual'],
])('formatDelta(%s, %s) = %s', (value, previous, expected) => {
  expect(formatDelta(value, previous)).toBe(expected);
});

it('spokenDelta lê a comparação por extenso', () => {
  expect(spokenDelta(12, 10)).toBe('mais 20 por cento em relação ao período anterior');
  expect(spokenDelta(9, 10)).toBe('menos 10 por cento em relação ao período anterior');
  expect(spokenDelta(5, 0)).toBe('sem dados do período anterior');
});
