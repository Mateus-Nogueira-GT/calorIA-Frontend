import { resolveBaseUrl } from './api';

describe('resolveBaseUrl', () => {
  it('usa a URL do .env quando presente (produção/dev configurado)', () => {
    expect(resolveBaseUrl('https://caloria.vercel.app/api', 'android')).toBe(
      'https://caloria.vercel.app/api',
    );
  });

  it('fallback Android → 10.0.2.2 (localhost do emulador é o próprio device)', () => {
    expect(resolveBaseUrl(undefined, 'android')).toBe('http://10.0.2.2:3000');
    expect(resolveBaseUrl('', 'android')).toBe('http://10.0.2.2:3000');
  });

  it('fallback iOS/web → localhost', () => {
    expect(resolveBaseUrl(undefined, 'ios')).toBe('http://localhost:3000');
    expect(resolveBaseUrl(undefined, 'web')).toBe('http://localhost:3000');
  });
});
