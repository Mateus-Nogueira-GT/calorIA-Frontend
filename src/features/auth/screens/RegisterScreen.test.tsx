import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterScreen } from './RegisterScreen';

let mockGoogleSignInAvailable = true;
let mockAppleSignInAvailable = true;

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockSetPendingAuth = jest.fn();
const mockRegister = jest.fn().mockResolvedValue({
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
    register: mockRegister,
    loginWithApple: mockLoginWithApple,
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setPendingAuth: jest.Mock }) => unknown) =>
    sel({ setPendingAuth: mockSetPendingAuth }),
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

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    mockReplace.mockClear();
    mockGoogleSignInAvailable = true;
    mockAppleSignInAvailable = true;
  });

  it('renderiza os campos de nome, email e senha', () => {
    const { getByPlaceholderText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('Seu nome completo')).toBeTruthy();
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
  });

  it('exibe erro de validação se nome tiver menos de 2 caracteres', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('Seu nome completo'), 'A');
    fireEvent(getByPlaceholderText('Seu nome completo'), 'blur');
    await waitFor(() => expect(getByText('Nome deve ter no mínimo 2 caracteres')).toBeTruthy());
  });

  it('exibe erro de validação para email inválido', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'nao-e-email');
    fireEvent(getByPlaceholderText('seu@email.com'), 'blur');
    await waitFor(() => expect(getByText('E-mail inválido')).toBeTruthy());
  });

  it('substitui a tela por Login ao clicar no footer de entrar', () => {
    const { getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.press(getByText('Já tem conta? Entrar'));
    expect(mockReplace).toHaveBeenCalledWith('Login');
  });

  it('não exibe o CTA do Google quando o provider não está disponível', () => {
    mockGoogleSignInAvailable = false;
    mockAppleSignInAvailable = false;
    const { queryByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    expect(queryByText('Continuar com Google')).toBeNull();
    expect(queryByText('Continuar com Apple')).toBeNull();
    expect(queryByText('ou')).toBeNull();
  });

  it('executa o login com Apple ao tocar no CTA', async () => {
    const { getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );

    fireEvent.press(getByText('Continuar com Apple'));

    await waitFor(() => expect(mockGetAppleSignInPayload).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockLoginWithApple).toHaveBeenCalledWith('apple-token', 'João Teste'),
    );
    await waitFor(() => expect(mockSetPendingAuth).toHaveBeenCalledWith('tok', expect.any(Object)));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('ProfileSetup'));
  });
});
