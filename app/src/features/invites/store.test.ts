import { inviteTokenFromURL, useInviteStore } from './store';
import { useAuthStore } from '@features/auth/store';
const token = 'a'.repeat(43);
it('accepts custom app scheme and HTTPS fragment without changing the token', () => {
  expect(inviteTokenFromURL(`caloria://invite/${token}`)).toBe(token);
  expect(inviteTokenFromURL(`https://example.test/convite#${token}`)).toBe(token);
});
it.each([
  `https://example.test/convite?token=${token}`,
  `https://example.test/convite/${token}`,
  `caloria://invite/${token}?track=1`,
  `caloria://invite/${'x'.repeat(42)}`,
  `caloria://invite/${'x'.repeat(44)}`,
  'not a url',
])('rejects invalid token delivery: %s', (url) => expect(inviteTokenFromURL(url)).toBeNull());
it.each([
  'https://app.caloriaoficial.com.br/convite',
  'https://app.caloriaoficial.com.br/convite/',
])('accepts the official domain universal link: %s', (base) =>
  expect(inviteTokenFromURL(`${base}#${token}`)).toBe(token),
);
it('rejects the official domain link with the token in the query string', () =>
  expect(inviteTokenFromURL(`https://app.caloriaoficial.com.br/convite?t=${token}`)).toBeNull());
it('keeps the pending invitation through account switch for explicit confirmation', () => {
  useInviteStore.getState().setToken(token);
  useAuthStore.setState({ sessionGeneration: useAuthStore.getState().sessionGeneration + 1 });
  expect(useInviteStore.getState().token).toBe(token);
  useInviteStore.getState().setToken(null);
});
