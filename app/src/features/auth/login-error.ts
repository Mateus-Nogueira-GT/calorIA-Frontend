import { isNetworkError } from '@shared/utils/api-error';

/**
 * Mensagem do login por motivo. Antes, toda falha virava "Credenciais
 * inválidas" — inclusive conta criada pelo Google/Apple (que não tem senha),
 * e-mail não confirmado e excesso de tentativas.
 */
export function loginErrorMessage(error: unknown): string {
  if (isNetworkError(error))
    return 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
  const response = (error as { response?: { status?: number; data?: { error?: string } } })
    ?.response;
  switch (response?.data?.error) {
    case 'GOOGLE_LOGIN_ACCOUNT':
      return 'Esta conta foi criada com o Google e não tem senha. Toque em "Continuar com Google". Se preferir usar senha, toque em "Esqueci minha senha" para criar uma.';
    case 'APPLE_LOGIN_ACCOUNT':
      return 'Esta conta foi criada com a Apple e não tem senha. No iPhone, toque em "Continuar com Apple". Em outro aparelho, toque em "Esqueci minha senha" para criar uma senha.';
    case 'EMAIL_NOT_CONFIRMED':
      return 'Falta confirmar seu e-mail. Abra o link que enviamos para sua caixa de entrada (confira também o spam).';
    case 'TOO_MANY_ATTEMPTS':
    case 'TOO_MANY_REQUESTS':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
    case 'AUTH_UNAVAILABLE':
      return 'Não foi possível entrar agora. Tente novamente em instantes.';
    case 'INVALID_CREDENTIALS':
      return 'E-mail ou senha incorretos. Confira e tente de novo, ou toque em "Esqueci minha senha".';
  }
  if (response?.status === 429)
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (response?.status && response.status >= 500)
    return 'Não foi possível entrar agora. Tente novamente em instantes.';
  return 'E-mail ou senha incorretos. Confira e tente de novo, ou toque em "Esqueci minha senha".';
}
