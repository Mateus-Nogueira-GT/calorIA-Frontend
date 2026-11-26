import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterScreen } from './RegisterScreen';
import { useScannerStore } from '@features/scanner/store';
import { useInviteStore } from '@features/invites/store';

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
  refreshToken: 'refresh-tok',
  user: { id: '1', name: 'João', email: 'joao@test.com' },
});
const mockGetAppleSignInPayload = jest.fn().mockResolvedValue({
  identityToken: 'apple-token',
  fullName: 'João Teste',
  // A lib liga o nonce por padrão; o Supabase EXIGE o valor bruto para validar
  // o token. Esquecer de repassá-lo fazia todo login com Apple falhar.
  nonce: 'nonce-bruto',
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, replace: mockReplace }),
}));
// As factories de jest.mock são içadas acima dos `const mock*`: referenciar a
// função direto congela um valor indefinido. Chamar por dentro de uma arrow
// adia a leitura para o momento da chamada (padrão já usado no apple-signin).
const mockLogin = jest.fn();
const mockResendConfirmation = jest.fn().mockResolvedValue({ success: true });
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    register: (...args: unknown[]) => mockRegister(...args),
    login: (...args: unknown[]) => mockLogin(...args),
    resendConfirmation: (...args: unknown[]) => mockResendConfirmation(...args),
    loginWithApple: (...args: unknown[]) => mockLoginWithApple(...args),
  },
  isConfirmationRequired: (r: { status?: string } | null | undefined) =>
    r?.status === 'confirmation_required',
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
      expect(mockLoginWithApple).toHaveBeenCalledWith('apple-token', 'João Teste', 'nonce-bruto'),
    );
    await waitFor(() =>
      expect(mockSetPendingAuth).toHaveBeenCalledWith('tok', expect.any(Object), 'refresh-tok'),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('ProfileSetup'));
  });

  it('oferece ir para o login quando o e-mail já está cadastrado', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRegister.mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } });

    const { getByPlaceholderText, getByTestId } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('Seu nome completo'), 'João');
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'joao@test.com');
    fireEvent.changeText(getByPlaceholderText('Mínimo 8 caracteres'), 'senha12345');
    fireEvent.press(getByTestId('register-btn'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'E-mail já cadastrado',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Entrar' })]),
    ));
    alertSpy.mockRestore();
  });

  describe('A4: backend responde confirmation_required', () => {
    const confirmation = { status: 'confirmation_required', email: 'joao@test.com' };
    const session = {
      token: 'tok-confirmado',
      refreshToken: 'refresh-confirmado',
      user: { id: '1', name: 'João', email: 'joao@test.com' },
    };

    function submit() {
      const screen = render(
        <RegisterScreen navigation={{ navigate: mockNavigate, replace: mockReplace } as never} route={{} as never} />,
      );
      fireEvent.changeText(screen.getByPlaceholderText('Seu nome completo'), 'João');
      fireEvent.changeText(screen.getByPlaceholderText('seu@email.com'), 'joao@test.com');
      fireEvent.changeText(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'senha12345');
      fireEvent.press(screen.getByTestId('register-btn'));
      return screen;
    }

    it('mostra "Confirme seu e-mail" sem criar sessão nem ir ao ProfileSetup', async () => {
      mockRegister.mockResolvedValueOnce(confirmation);
      const { findByText, getByText } = submit();
      expect(await findByText('Confirme seu e-mail')).toBeTruthy();
      expect(getByText(/joao@test\.com/)).toBeTruthy();
      expect(getByText('Reenviar e-mail')).toBeTruthy();
      expect(getByText('Já confirmei, entrar')).toBeTruthy();
      expect(mockSetPendingAuth).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('"Reenviar e-mail" chama o reenvio com o e-mail do cadastro', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockRegister.mockResolvedValueOnce(confirmation);
      const { findByText } = submit();
      fireEvent.press(await findByText('Reenviar e-mail'));
      await waitFor(() => expect(mockResendConfirmation).toHaveBeenCalledWith('joao@test.com'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('E-mail reenviado', expect.any(String)));
      alertSpy.mockRestore();
    });

    it('"Já confirmei, entrar" faz login e segue o onboarding de sempre', async () => {
      mockRegister.mockResolvedValueOnce(confirmation);
      mockLogin.mockResolvedValueOnce(session);
      const { findByText } = submit();
      fireEvent.press(await findByText('Já confirmei, entrar'));
      await waitFor(() =>
        expect(mockLogin).toHaveBeenCalledWith({ email: 'joao@test.com', password: 'senha12345' }),
      );
      await waitFor(() =>
        expect(mockSetPendingAuth).toHaveBeenCalledWith('tok-confirmado', session.user, 'refresh-confirmado'),
      );
      expect(mockNavigate).toHaveBeenCalledWith('ProfileSetup');
    });

    it('ainda sem confirmar: fica no estado e explica', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockRegister.mockResolvedValueOnce(confirmation);
      mockLogin.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 403, data: { error: 'EMAIL_NOT_CONFIRMED' } },
      });
      const { findByText, getByText } = submit();
      fireEvent.press(await findByText('Já confirmei, entrar'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith('Ainda falta confirmar', expect.stringContaining('link')),
      );
      expect(getByText('Confirme seu e-mail')).toBeTruthy();
      expect(mockSetPendingAuth).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });

    it('"Usar outro e-mail" volta ao formulário', async () => {
      mockRegister.mockResolvedValueOnce(confirmation);
      const { findByText, getByTestId, queryByText } = submit();
      fireEvent.press(await findByText('Usar outro e-mail'));
      expect(getByTestId('register-btn')).toBeTruthy();
      expect(queryByText('Confirme seu e-mail')).toBeNull();
    });

    // "Criar conta para salvar" do scanner de convidado e o gate de convite
    // caem nesta mesma tela: o scan (memória) e o convite (persistido) não
    // podem sumir enquanto a pessoa vai ao e-mail e volta.
    it('não perde o scan do convidado nem o convite pendente', async () => {
      const item = { id: 'i1', name: 'Arroz', weightGrams: 100, calories: 130, protein: 2, carbs: 28, fat: 0, fiber: 0, confidence: 0.9 };
      useScannerStore.setState({ items: [item] as never });
      useInviteStore.setState({ token: 'T'.repeat(43) });
      mockRegister.mockResolvedValueOnce(confirmation);
      mockLogin.mockResolvedValueOnce(session);
      const { findByText } = submit();
      await findByText('Confirme seu e-mail');
      expect(useScannerStore.getState().items).toHaveLength(1);
      expect(useInviteStore.getState().token).toBe('T'.repeat(43));
      fireEvent.press(await findByText('Já confirmei, entrar'));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('ProfileSetup'));
      expect(useScannerStore.getState().items).toEqual([item]);
      expect(useInviteStore.getState().token).toBe('T'.repeat(43));
      useScannerStore.setState({ items: [] });
      useInviteStore.setState({ token: null });
    });

    it('resposta com sessão (flag desligada) segue igual a hoje', async () => {
      mockRegister.mockResolvedValueOnce(session);
      submit();
      await waitFor(() =>
        expect(mockSetPendingAuth).toHaveBeenCalledWith('tok-confirmado', session.user, 'refresh-confirmado'),
      );
      expect(mockNavigate).toHaveBeenCalledWith('ProfileSetup');
    });
  });
});
