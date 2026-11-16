import { loginErrorMessage } from './login-error';

const err = (status: number, error?: string) => ({ response: { status, data: { error } } });

it('conta do Google ou da Apple explica que não há senha e qual botão usar', () => {
  expect(loginErrorMessage(err(401, 'GOOGLE_LOGIN_ACCOUNT'))).toMatch(/Continuar com Google/);
  expect(loginErrorMessage(err(401, 'APPLE_LOGIN_ACCOUNT'))).toMatch(/Esqueci minha senha/);
});

it('cada motivo tem a sua mensagem', () => {
  expect(loginErrorMessage(err(403, 'EMAIL_NOT_CONFIRMED'))).toMatch(/confirmar seu e-mail/);
  expect(loginErrorMessage(err(429, 'TOO_MANY_ATTEMPTS'))).toMatch(/Muitas tentativas/);
  expect(loginErrorMessage(err(429, 'TOO_MANY_REQUESTS'))).toMatch(/Muitas tentativas/);
  expect(loginErrorMessage(err(503, 'AUTH_UNAVAILABLE'))).toMatch(/instantes/);
  expect(loginErrorMessage(err(401, 'INVALID_CREDENTIALS'))).toMatch(/E-mail ou senha incorretos/);
});

it('backend antigo (sem código novo) e erro de servidor', () => {
  expect(loginErrorMessage(err(401))).toMatch(/E-mail ou senha incorretos/);
  expect(loginErrorMessage(err(502))).toMatch(/instantes/);
});

it('sem resposta do servidor → mensagem de conexão', () => {
  expect(loginErrorMessage({ isAxiosError: true, request: {}, message: 'Network Error' })).toMatch(
    /conexão/,
  );
});
