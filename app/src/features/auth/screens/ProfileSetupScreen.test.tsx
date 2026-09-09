import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSetupScreen } from './ProfileSetupScreen';

const mockProfileSetup = jest.fn().mockResolvedValue({ success: true });
const mockSetToken = jest.fn();
const mockSetProfilePreferences = jest.fn();
const mockSetProfileComplete = jest.fn();
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
      setProfileComplete: mockSetProfileComplete,
      pendingAuth,
      user: pendingAuth.user,
    }),
}));

/** Percorre os 7 passos do onboarding até disparar o envio do perfil. */
async function completeOnboarding(
  utils: ReturnType<typeof render>,
  { height = '180', weight = '80' }: { height?: string; weight?: string } = {},
) {
  const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;
  const answer = async (value: string, nextQuestion: RegExp) => {
    fireEvent.changeText(getByPlaceholderText('Digite aqui...'), value);
    fireEvent.press(getByTestId('send-btn'));
    await findByText(nextQuestion);
  };

  await answer('João', /qual é o seu biotipo/i);
  fireEvent.press(getByText('Ectomorfo'));
  await answer(height, /qual é o seu peso atual/i);
  await answer(weight, /qual é o seu objetivo principal/i);
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

  /**
   * R1: o campo de texto do onboarding é um TextInput genérico, sem máscara e
   * sem validação. Um brasileiro digita a altura como "1,80"; `Number("1,80")`
   * é NaN e o JSON.stringify manda `null` ao backend, que rejeita
   * (`z.number().optional()` aceita undefined, não null). O usuário tomava
   * "Não foi possível salvar seu perfil" sem nenhuma pista do motivo, e
   * repetia o mesmo erro para sempre.
   */
  describe('R1 — validação de altura e peso', () => {
    it('aceita vírgula decimal e metros: "1,80" vira 180 cm', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '1,80', weight: '80,5' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as {
        heightCm: number;
        weightKg: number;
      };
      expect(payload.heightCm).toBe(180);
      expect(payload.weightKg).toBe(80.5);
    });

    it('aceita unidade junto do número: "180 cm" e "80 kg"', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '180 cm', weight: '80 kg' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as {
        heightCm: number;
        weightKg: number;
      };
      expect(payload.heightCm).toBe(180);
      expect(payload.weightKg).toBe(80);
    });

    it('nunca envia NaN nem null, aconteça o que acontecer', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '1,80', weight: '80,5' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as Record<string, unknown>;
      // JSON.stringify transforma NaN em null: é assim que o backend recebia.
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
      for (const [key, value] of Object.entries(payload)) {
        expect(`${key}=${String(value)}`).not.toContain('NaN');
        expect(value).not.toBeNull();
      }
    });

    it('resposta não numérica não avança o passo — o Coach repergunta', async () => {
      const utils = render(
        <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
      );
      const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'João');
      fireEvent.press(getByTestId('send-btn'));
      await findByText(/qual é o seu biotipo/i);
      fireEvent.press(getByText('Ectomorfo'));
      await findByText(/qual é a sua altura/i);

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'um metro e oitenta');
      fireEvent.press(getByTestId('send-btn'));

      // Continua no passo 3 de 7 e explica o que fazer.
      await findByText(/não entendi a altura/i);
      expect(getByText('3 / 7')).toBeTruthy();
    });

    it('altura fora da faixa plausível é recusada', async () => {
      const utils = render(
        <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
      );
      const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'João');
      fireEvent.press(getByTestId('send-btn'));
      await findByText(/qual é o seu biotipo/i);
      fireEvent.press(getByText('Ectomorfo'));
      await findByText(/qual é a sua altura/i);

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), '999');
      fireEvent.press(getByTestId('send-btn'));

      await findByText(/altura não parece certa/i);
      expect(getByText('3 / 7')).toBeTruthy();
    });
  });

  it('mostra a causa real quando o backend explica o erro', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProfileSetup.mockRejectedValue({
      response: { data: { message: 'Altura deve ser um número' } },
    });

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![1]).toContain('Altura deve ser um número');
    spy.mockRestore();
  });

  it('marca o perfil como completo ao salvar (destrava o gate do R6)', async () => {
    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockSetProfileComplete).toHaveBeenCalledWith(true));
  });

  it('não marca o perfil como completo quando salvar falha', async () => {
    mockProfileSetup.mockRejectedValue(new Error('offline'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
    expect(mockSetProfileComplete).not.toHaveBeenCalled();
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