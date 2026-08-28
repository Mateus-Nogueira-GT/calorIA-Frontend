import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';

let mockGoogleSignInAvailable = true;
let mockAppleSignInAvailable = true;

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockSetToken = jest.fn();
const mockLogin = jest.fn().mockResolvedValue({
  token: 'tok',
  user: { id: '1', name: 'João', email: 'joao@test.com' },
});
const mockLoginWithApple = jest.fn().mockResolvedValue({
  token: 'tok',
  refreshToken: 'refresh-tok',
  user: { id: '1', name: 'João', email: 'joao@test.com' },
});
const mockGetAppleSignInPayload = jest.fn().mockResolvedValue({
  identityToken: 'apple-token',
  fullName: 'João Teste',
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
}));
// As factories de jest.mock são içadas acima dos `const mock*`: referenciar a
// função direto congela um valor indefinido. Chamar por dentro de uma arrow
// adia a leitura para o momento da chamada (padrão já usado no apple-signin).
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    login: (...args: unknown[]) => mockLogin(...args),
    loginWithApple: (...args: unknown[]) => mockLoginWithApple(...args),
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setToken: jest.Mock }) => unknown) =>
    sel({ setToken: mockSetToken }),
}));
jest.mock('@shared/services/google-signin.service', () => ({
  getGoogleIdToken: jest.fn(),
  get isGoogleSignInAvailable() {
    return mockGoogleSignInAvailable;
  },
}));
jest.mock('@shared/services/apple-signin.service', () => ({
  getAppleSignInPayload: (...args: unknown[]) => mockGetAppleSignInPayload(...args),
  get isAppleSignInAvailable() {
    return mockAppleSignInAvailable;
  },
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockReplace.mockClear();
    mockGoogleSignInAvailable = true;
    mockAppleSignInAvailable = true;
  });

  it('renderiza os campos de email e senha', () => {
    const { getByPlaceholderText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Sua senha')).toBeTruthy();
  });

  it('exibe link de recuperar senha', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    expect(getByText('Esqueci minha senha')).toBeTruthy();
  });

  it('navega para ForgotPassword ao clicar no link', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.press(getByText('Esqueci minha senha'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
  });

  it('substitui a tela por Register ao clicar no footer de criar conta', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.press(getByText('Não tem conta? Criar conta'));
    expect(mockReplace).toHaveBeenCalledWith('Register');
  });

  it('não exibe o CTA do Google quando o provider não está disponível', () => {
    mockGoogleSignInAvailable = false;
    mockAppleSignInAvailable = false;
    const { queryByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    expect(queryByText('Continuar com Google')).toBeNull();
    expect(queryByText('Continuar com Apple')).toBeNull();
    expect(queryByText('ou')).toBeNull();
  });

  it('executa o login com Apple ao tocar no CTA', async () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );

    fireEvent.press(getByText('Continuar com Apple'));

    await waitFor(() => expect(mockGetAppleSignInPayload).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockLoginWithApple).toHaveBeenCalledWith('apple-token', 'João Teste'),
    );
    await waitFor(() =>
      expect(mockSetToken).toHaveBeenCalledWith('tok', expect.any(Object), 'refresh-tok'),
    );
  });

  it('remove o espaço que o teclado adiciona no fim do e-mail', async () => {
    const { getByPlaceholderText, getByTestId } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );

    // Gboard/Samsung completam o e-mail com espaço: o botão ficava morto.
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'joao@test.com ');
    fireEvent.changeText(getByPlaceholderText('Sua senha'), 'senha12345');
    fireEvent.press(getByTestId('login-btn'));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({ email: 'joao@test.com', password: 'senha12345' }),
    );
  });

  it('distingue falha de rede de credenciais inválidas', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockLogin.mockRejectedValueOnce({ isAxiosError: true, response: undefined });

    const { getByPlaceholderText, getByTestId } = render(
      <LoginScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'joao@test.com');
    fireEvent.changeText(getByPlaceholderText('Sua senha'), 'senha12345');
    fireEvent.press(getByTestId('login-btn'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Erro', expect.stringContaining('conexão')),
    );
    alertSpy.mockRestore();
  });
});