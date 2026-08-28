import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSetupScreen } from './ProfileSetupScreen';

const mockProfileSetup = jest.fn().mockResolvedValue({ success: true });
const mockSetToken = jest.fn();
const mockSetProfilePreferences = jest.fn();
const pendingAuth = {
  token: 'tok',
  refreshToken: 'refresh-tok',
  user: { id: '1', name: 'João', email: 'j@t.com' },
};

jest.mock('@shared/services/auth.service', () => ({
  authService: { profileSetup: (...args: unknown[]) => mockProfileSetup(...args) },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setToken: mockSetToken,
      setProfilePreferences: mockSetProfilePreferences,
      pendingAuth,
      user: pendingAuth.user,
    }),
}));

/** Percorre os 7 passos do onboarding até disparar o envio do perfil. */
async function completeOnboarding(utils: ReturnType<typeof render>) {
  const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;
  const answer = async (value: string, nextQuestion: RegExp) => {
    fireEvent.changeText(getByPlaceholderText('Digite aqui...'), value);
    fireEvent.press(getByTestId('send-btn'));
    await findByText(nextQuestion);
  };

  await answer('João', /qual é o seu biotipo/i);
  fireEvent.press(getByText('Ectomorfo'));
  await answer('180', /qual é o seu peso atual/i);
  await answer('80', /qual é o seu objetivo principal/i);
  fireEvent.press(getByText('Perder peso'));
  fireEvent.press(getByText('Motivador'));
  fireEvent.press(getByText('Neutro'));
}

describe('ProfileSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileSetup.mockResolvedValue({ success: true });
  });

  it('exibe a primeira pergunta do coach ao montar', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText(/como você gostaria de ser chamado/i)).toBeTruthy();
  });

  it('exibe o progress bar iniciando em 1/7', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText('1 / 7')).toBeTruthy();
  });

  it('avança para a segunda pergunta após responder a primeira via input', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    const input = getByPlaceholderText('Digite aqui...');
    fireEvent.changeText(input, 'João');
    fireEvent.press(getByTestId('send-btn'));
    await waitFor(() => expect(getByText('2 / 7')).toBeTruthy());
  });

  it('só autentica DEPOIS de o perfil ser salvo', async () => {
    const order: string[] = [];
    mockProfileSetup.mockImplementation(async () => {
      order.push('profileSetup');
      return { success: true };
    });
    mockSetToken.mockImplementation(() => order.push('setToken'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockSetToken).toHaveBeenCalled());
    expect(order).toEqual(['profileSetup', 'setToken']);
  });

  it('não autentica quando salvar o perfil falha', async () => {
    mockProfileSetup.mockRejectedValue(new Error('offline'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
    expect(mockSetToken).not.toHaveBeenCalled();
  });
});