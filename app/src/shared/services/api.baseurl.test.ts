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

  it('release (__DEV__=false) sem env lança em vez de apontar para localhost', () => {
    const g = globalThis as { __DEV__?: boolean };
    g.__DEV__ = false;
    try {
      expect(() => resolveBaseUrl(undefined, 'android')).toThrow(/API_BASE_URL/);
      expect(() => resolveBaseUrl('', 'ios')).toThrow(/API_BASE_URL/);
      // com env presente, release funciona normalmente
      expect(resolveBaseUrl('https://caloria.vercel.app/api', 'android')).toBe(
        'https://caloria.vercel.app/api',
      );
    } finally {
      g.__DEV__ = true;
    }
  });
});
