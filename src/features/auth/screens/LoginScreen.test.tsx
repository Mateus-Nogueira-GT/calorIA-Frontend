import React from 'react';
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
  user: { id: '1', name: 'João', email: 'joao@test.com' },
});
const mockGetAppleSignInPayload = jest.fn().mockResolvedValue({
  identityToken: 'apple-token',
  fullName: 'João Teste',
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    login: mockLogin,
    loginWithApple: mockLoginWithApple,
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
    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith('tok', expect.any(Object)));
  });
});
