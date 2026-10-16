import { creditErrorMessage, formatCredits } from './credits.service';
it('formats integer accounting units without rounding away partial messages', () => {
  expect(formatCredits(75)).toBe('15');
  expect(formatCredits(60)).toBe('12');
  expect(formatCredits(58)).toBe('11,6');
  expect(formatCredits(1)).toBe('0,2');
});
it('distinguishes an insufficient wallet from accounting unavailable and audio policy', () => {
  expect(creditErrorMessage({ response: { data: { error: 'INSUFFICIENT_CREDITS' } } })).toMatch(
    /insuficientes/,
  );
  expect(creditErrorMessage({ response: { data: { error: 'CREDITS_UNAVAILABLE' } } })).toMatch(
    /consultar/,
  );
  expect(
    creditErrorMessage({ response: { data: { error: 'CREDIT_POLICY_UNAVAILABLE' } } }),
  ).toMatch(/tarifa/);
  expect(creditErrorMessage(new Error('microphone'))).toBeNull();
});
