import { appleAuth } from '@invertase/react-native-apple-authentication';
import { getAppleSignInPayload } from './apple-signin.service';

const performRequest = appleAuth.performRequest as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAppleSignInPayload', () => {
  it('devolve o identityToken e junta o nome completo', async () => {
    performRequest.mockResolvedValue({
      identityToken: 'apple-token',
      fullName: { givenName: 'Maria', familyName: 'Silva' },
    });

    await expect(getAppleSignInPayload()).resolves.toEqual({
      identityToken: 'apple-token',
      fullName: 'Maria Silva',
    });
  });

  /**
   * A Apple só manda o nome no PRIMEIRO login de cada Apple ID. Nos seguintes
   * vem null, e o app não pode quebrar nem mandar a string 'null undefined'
   * para o backend.
   */
  it('omite o nome quando a Apple não manda (logins seguintes)', async () => {
    performRequest.mockResolvedValue({ identityToken: 'apple-token', fullName: null });

    await expect(getAppleSignInPayload()).resolves.toEqual({
      identityToken: 'apple-token',
      fullName: undefined,
    });
  });

  it('ignora partes ausentes do nome em vez de concatenar vazio', async () => {
    performRequest.mockResolvedValue({
      identityToken: 'apple-token',
      fullName: { givenName: 'Maria', familyName: null },
    });

    await expect(getAppleSignInPayload()).resolves.toEqual({
      identityToken: 'apple-token',
      fullName: 'Maria',
    });
  });

  it('rejeita quando não vem identityToken', async () => {
    performRequest.mockResolvedValue({ identityToken: null });

    await expect(getAppleSignInPayload()).rejects.toThrow('did not return an identity token');
  });
});
