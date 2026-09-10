import {
  GoogleSignInCancelledError,
  extractIdToken,
  getGoogleIdToken,
  isGoogleSignInAvailable,
} from './google-signin.service';

/**
 * Os testes miram `extractIdToken` em vez de `getGoogleIdToken` porque o
 * `GOOGLE_WEB_CLIENT_ID` é inlinado pelo babel a partir do `.env` em tempo de
 * compilação — não dá para variar em runtime. A lógica que quebra entre
 * versões da lib é justamente esta, e aqui ela fica coberta.
 */
describe('extractIdToken', () => {
  it('lê o idToken de dentro de data — a forma da v16', () => {
    expect(extractIdToken({ type: 'success', data: { idToken: 'token-valido' } })).toBe(
      'token-valido',
    );
  });

  it('trata cancelamento do usuário como erro dedicado, não como falha de login', () => {
    expect(() => extractIdToken({ type: 'cancelled', data: null })).toThrow(
      GoogleSignInCancelledError,
    );
  });

  it('rejeita quando o sucesso vem sem idToken', () => {
    expect(() => extractIdToken({ type: 'success', data: { idToken: null } })).toThrow(
      'did not return an id token',
    );
  });

  /**
   * Antes da v13 a lib devolvia `{ idToken }` na raiz. O serviço foi escrito
   * contra aquela API e continuava lendo a raiz, o que na v16 dá `undefined`
   * SEMPRE — login quebrado em produção com os testes verdes, porque o mock
   * também estava na forma antiga. Este teste trava a regressão.
   */
  it('não aceita a forma pré-v13 { idToken } na raiz', () => {
    expect(() =>
      extractIdToken({ idToken: 'forma-antiga' } as unknown as Parameters<
        typeof extractIdToken
      >[0]),
    ).toThrow(GoogleSignInCancelledError);
  });
});

describe('getGoogleIdToken', () => {
  it('falha com mensagem acionável enquanto GOOGLE_WEB_CLIENT_ID não estiver no .env', async () => {
    await expect(getGoogleIdToken()).rejects.toThrow('GOOGLE_WEB_CLIENT_ID ausente');
  });
});

describe('isGoogleSignInAvailable', () => {
  /**
   * O `.env` do repositório tem GOOGLE_WEB_CLIENT_ID vazio, então o botão não
   * deve aparecer mesmo com a lib nativa instalada.
   */
  it('é falso enquanto faltar GOOGLE_WEB_CLIENT_ID, mesmo com a lib instalada', () => {
    expect(isGoogleSignInAvailable).toBe(false);
  });
});
